import React, { useEffect, useState, useRef } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  setDoc,
  getDoc,
  deleteDoc,
  getDocFromServer,
  updateDoc
} from 'firebase/firestore';
import { 
  MessageCircle, 
  Send, 
  LogOut, 
  LogIn, 
  Shield, 
  Trash2,
  Bot,
  Search,
  Users,
  Edit,
  Save,
  X,
  Plus,
  AlertTriangle,
  Volume2,
  Bell,
  Phone,
  Eye,
  Settings,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Code2,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';

// Connection test as required by integration guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
  } catch (error) {
    if (error instanceof Error && (error.message.includes('offline') || error.message.includes('unavailable'))) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

// Constants
const ADMIN_EMAIL = 'kfcrobotpw@gmail.com';

interface Message {
  id: string;
  roomId: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  timestamp: any;
  attachment?: {
    name: string;
    url: string;
    type: string;
    size: number;
  };
}

interface Room {
  id: string;
  type: 'dm' | 'group';
  participants: string[];
  name?: string;
  lastMessage?: string;
  lastActivity?: any;
  createdBy: string;
  isExecutiveRoom?: boolean;
}

interface Notice {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: any;
}

interface ClubMember {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  realName?: string;
  studentId?: string;
  phoneNumber?: string;
  role?: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  warnings?: number;
  lastSeen: any;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'members' | 'notices' | 'supervision'>('chat');
  
  useEffect(() => {
    testConnection();
  }, []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isExecutive, setIsExecutive] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [editingMember, setEditingMember] = useState<ClubMember | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showRoomCreation, setShowRoomCreation] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [onboardingData, setOnboardingData] = useState({ realName: '', phoneNumber: '' });
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '' });
  const [attachment, setAttachment] = useState<{ name: string; url: string; type: string; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsAdmin(currentUser.email === ADMIN_EMAIL);
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            const initialUser = {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName || 'Anonymous User',
              photoURL: currentUser.photoURL || '',
              isAdmin: currentUser.email === ADMIN_EMAIL,
              isExecutive: currentUser.email === ADMIN_EMAIL,
              lastSeen: serverTimestamp(),
              realName: '',
              studentId: '',
              role: 'Member',
              phoneNumber: '',
              warnings: 0
            };
            await setDoc(userRef, initialUser);
            setIsExecutive(initialUser.isExecutive);
            setShowOnboarding(true);
          } else {
            const data = userDoc.data() as ClubMember;
            const needsMigration = !('isExecutive' in data);
            
            setIsExecutive(data.isExecutive || data.isAdmin || (currentUser.email === ADMIN_EMAIL));
            
            const updatePayload: any = { lastSeen: serverTimestamp() };
            if (needsMigration) {
               updatePayload.isExecutive = !!(data.isAdmin || (currentUser.email === ADMIN_EMAIL));
            }
            
            await updateDoc(userRef, updatePayload);
            
            if (!data.realName || !data.phoneNumber) {
              setShowOnboarding(true);
            }
          }
        } catch (error) {
          console.error("Error syncing user:", error);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Rooms listener
    const qRooms = isAdmin && activeTab === 'supervision' 
      ? query(collection(db, 'rooms'), orderBy('lastActivity', 'desc'))
      : query(collection(db, 'rooms'), orderBy('lastActivity', 'desc')); 
    
    const unsubRooms = onSnapshot(qRooms, (snapshot) => {
      const rmList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Room[];
      
      const filtered = (isAdmin && activeTab === 'supervision') 
        ? rmList 
        : rmList.filter(r => {
            const isUserParticipant = r.participants.includes(user.uid);
            if (r.isExecutiveRoom) {
              return isUserParticipant && (isExecutive || isAdmin);
            }
            return isUserParticipant;
          });
      setRooms(filtered);
      
      if (!selectedRoom && filtered.length > 0) {
        setSelectedRoom(filtered[0]);
      }
    });

    // Members listener
    const unsubMembers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const mems = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as ClubMember[];
      setMembers(mems);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Notices listener
    const qNotices = query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(20));
    const unsubNotices = onSnapshot(qNotices, (snapshot) => {
      setNotices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Notice[]);
    });

    return () => {
      unsubRooms();
      unsubMembers();
      unsubNotices();
    };
  }, [user, isAdmin, activeTab]);

  const EXECUTIVE_ROOM_ID = 'executive_room';

  useEffect(() => {
    const targetRoomId = (activeTab === 'chat' || activeTab === 'supervision') 
      ? (selectedRoom ? selectedRoom.id : EXECUTIVE_ROOM_ID)
      : null;

    if (!targetRoomId) {
      setMessages([]);
      return;
    }

    // Security check for executive room
    if (targetRoomId === EXECUTIVE_ROOM_ID && !isExecutive && !isAdmin) {
      setMessages([]);
      return;
    }
    
    const qMsg = query(
      collection(db, 'rooms', targetRoomId, 'messages'), 
      orderBy('timestamp', 'desc'), 
      limit(50)
    );
    
    const unsubMsg = onSnapshot(qMsg, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(msgs.reverse());
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${targetRoomId}/messages`);
    });

    return () => unsubMsg();
  }, [user, selectedRoom, isExecutive, isAdmin, activeTab]);

  useEffect(() => {
    if (scrollRef.current && activeTab === 'chat') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!newMessage.trim() && !attachment)) return;

    const targetRoomId = selectedRoom ? selectedRoom.id : EXECUTIVE_ROOM_ID;
    
    // Safety check for executive room
    if (targetRoomId === EXECUTIVE_ROOM_ID && !isExecutive && !isAdmin) return;

    try {
      const msgRef = collection(db, 'rooms', targetRoomId, 'messages');
      const payload: any = {
        roomId: targetRoomId,
        text: newMessage,
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous User',
        senderPhoto: user.photoURL || '',
        timestamp: serverTimestamp()
      };

      if (attachment) {
        payload.attachment = attachment;
      }

      await addDoc(msgRef, payload);
      
      // Update room activity
      if (selectedRoom) {
        await updateDoc(doc(db, 'rooms', targetRoomId), {
          lastMessage: attachment ? `[파일: ${attachment.name}] ${newMessage}` : newMessage,
          lastActivity: serverTimestamp()
        });
      } else {
        // Handle executive room persistence (create if not exists)
        const execRoomRef = doc(db, 'rooms', EXECUTIVE_ROOM_ID);
        const execRoomDoc = await getDoc(execRoomRef);
        if (!execRoomDoc.exists()) {
           await setDoc(execRoomRef, {
             name: '임원톡방',
             participants: [user.uid],
             isExecutiveRoom: true,
             createdBy: 'system',
             lastMessage: attachment ? `[파일: ${attachment.name}] ${newMessage}` : newMessage,
             lastActivity: serverTimestamp(),
             createdAt: serverTimestamp()
           });
        } else {
           await updateDoc(execRoomRef, {
             lastMessage: attachment ? `[파일: ${attachment.name}] ${newMessage}` : newMessage,
             lastActivity: serverTimestamp()
           });
        }
      }
      
      setNewMessage('');
      setAttachment(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `rooms/${targetRoomId}/messages`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit to 5MB for base64 safety in this preview
    if (file.size > 5 * 1024 * 1024) {
      alert("파일 크기는 5MB 이하여야 합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setAttachment({
        name: file.name,
        url: result,
        type: file.type || 'application/octet-stream',
        size: file.size
      });
    };
    reader.readAsDataURL(file);
  };

  const handleCreateRoom = async () => {
    if (!user || selectedMembers.length === 0) return;
    
    const participants = [...new Set([user.uid, ...selectedMembers])];
    const isDM = participants.length === 2;
    
    try {
      const roomRef = await addDoc(collection(db, 'rooms'), {
        type: isDM ? 'dm' : 'group',
        participants,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
        createdBy: user.uid,
        name: isDM ? '' : 'New Group'
      });
      
      setShowRoomCreation(false);
      setSelectedMembers([]);
      setActiveTab('chat');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'rooms');
    }
  };

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !onboardingData.realName || !onboardingData.phoneNumber) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        realName: onboardingData.realName,
        phoneNumber: onboardingData.phoneNumber
      });
      setShowOnboarding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handlePostNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !noticeForm.title || !noticeForm.content) return;
    try {
      await addDoc(collection(db, 'notices'), {
        ...noticeForm,
        authorId: user?.uid,
        createdAt: serverTimestamp()
      });
      setNoticeForm({ title: '', content: '' });
      setActiveTab('notices');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notices');
    }
  };

  const handleWarnUser = async (userId: string) => {
    if (!isAdmin) return;
    const userToWarn = members.find(m => m.uid === userId);
    if (!userToWarn) return;
    
    try {
      await updateDoc(doc(db, 'users', userId), {
        warnings: (userToWarn.warnings || 0) + 1
      });
      alert(`${userToWarn.displayName} 님에게 주의를 주었습니다.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!isAdmin || !selectedRoom) return;
    try {
      await deleteDoc(doc(db, 'rooms', selectedRoom.id, 'messages', msgId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rooms/${selectedRoom.id}/messages/${msgId}`);
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || (!isAdmin && editingMember.uid !== user?.uid)) return;

    try {
      const userRef = doc(db, 'users', editingMember.uid);
      await updateDoc(userRef, {
        realName: editingMember.realName || '',
        studentId: editingMember.studentId || '',
        phoneNumber: editingMember.phoneNumber || '',
        role: editingMember.role || 'Member',
        isAdmin: editingMember.isAdmin,
        isExecutive: editingMember.isExecutive,
        displayName: editingMember.displayName,
        warnings: editingMember.warnings || 0
      });
      setEditingMember(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingMember.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-indigo-600">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <Bot className="h-12 w-12" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4 text-black">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 rounded-[40px] border border-neutral-100 bg-white p-10 text-center shadow-2xl"
        >
          <div className="flex justify-center">
            <div className="rounded-3xl bg-neutral-900 p-6 shadow-xl">
              <Bot className="h-14 w-14 text-white" />
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="font-sans text-4xl font-black tracking-tighter text-black">K.F.C. Robotics</h1>
            <p className="text-neutral-400 font-bold uppercase tracking-[0.3em] text-[10px]">Communication Interface</p>
          </div>
          <div className="space-y-4 pt-4">
            <button
              onClick={loginWithGoogle}
              className="group relative flex w-full items-center justify-center gap-4 overflow-hidden rounded-2xl bg-black px-4 py-5 font-black text-white transition-all hover:bg-neutral-800 shadow-xl"
            >
              <LogIn className="h-5 w-5" />
              GOOGLE ACCOUNT LOGIN
            </button>
          </div>
          <div className="pt-8 flex items-center justify-center gap-3 opacity-20">
            <div className="h-[1px] w-12 bg-black"></div>
            <span className="text-[10px] font-black tracking-widest uppercase">Intranet Access</span>
            <div className="h-[1px] w-12 bg-black"></div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white font-sans text-black lg:flex-row overflow-hidden">
      {/* Sidebar: Club Navigation */}
      <aside className="sticky top-0 z-20 flex w-full bg-black shadow-2xl lg:h-full lg:w-72 lg:flex-col lg:z-10">
        <div className="flex w-full items-center gap-3 p-6 bg-neutral-900 border-b border-white/10 lg:flex-none">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-black text-xl shadow-inner">
            K
          </div>
          <div>
            <h2 className="font-black text-white text-lg leading-tight tracking-tight">K.F.C. Robotics</h2>
            <p className="text-neutral-400 text-[10px] font-bold uppercase tracking-widest">Yongin Youth Center</p>
          </div>
        </div>

        <nav className="hidden flex-1 p-4 space-y-6 lg:block overflow-y-auto">
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <h2 className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Recent Chats</h2>
              <button 
                onClick={() => setShowRoomCreation(true)}
                className="p-1 hover:bg-neutral-800 rounded-md text-neutral-500 hover:text-white transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="space-y-1">
              {(isExecutive || isAdmin) && (
                <li 
                  onClick={() => { setActiveTab('chat'); setSelectedRoom(null); }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer font-bold shadow-sm transition-all ${activeTab === 'chat' && !selectedRoom ? 'bg-white text-black' : 'text-neutral-400 hover:bg-neutral-800'}`}
                >
                  <Shield className="h-4 w-4" />
                  # 임원톡방
                </li>
              )}
              {rooms.map(room => {
                const otherParticipants = room.participants.filter(p => p !== user.uid);
                const firstOther = members.find(m => m.uid === otherParticipants[0]);
                const displayName = room.type === 'dm' ? (firstOther?.realName || firstOther?.displayName || 'Unknown') : (room.name || 'Group Chat');
                
                return (
                  <li 
                    key={room.id}
                    onClick={() => { setActiveTab('chat'); setSelectedRoom(room); }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all font-medium truncate ${selectedRoom?.id === room.id ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:bg-neutral-800'}`}
                  >
                    <span className="opacity-50 text-lg font-light">#</span>
                    {displayName}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h2 className="px-2 mb-2 text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Main</h2>
            <ul className="space-y-1">
              <li 
                onClick={() => setActiveTab('notices')}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer font-bold shadow-sm transition-all ${activeTab === 'notices' ? 'bg-white text-black' : 'text-neutral-400 hover:bg-neutral-800'}`}
              >
                <Bell className="h-4 w-4" />
                공지사항
              </li>
              <li 
                onClick={() => setActiveTab('members')}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all font-bold ${activeTab === 'members' ? 'bg-white text-black' : 'text-neutral-400 hover:bg-neutral-800'}`}
              >
                <Users className="h-4 w-4" />
                회원 관리
              </li>
            </ul>
          </div>
          
          {isAdmin && (
            <div>
              <h2 className="px-2 mb-2 text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Administrator</h2>
              <ul className="space-y-1">
                <li 
                  onClick={() => setActiveTab('supervision')}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all font-bold ${activeTab === 'supervision' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:bg-neutral-800'}`}
                >
                  <Eye className="h-4 w-4" />
                  실시간 감독
                </li>
                <button 
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all font-bold ${showAdminPanel ? 'bg-white text-black shadow-lg' : 'text-neutral-400 hover:bg-neutral-800'}`}
                >
                  <Shield className="h-4 w-4" />
                  시스템 설정
                </button>
              </ul>
            </div>
          )}
        </nav>

        {/* User Status / Account */}
        <div className="p-4 bg-neutral-900 border-t border-white/5 lg:mt-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <img src={user.photoURL || ''} alt="" className="h-10 w-10 rounded-full border-2 border-white shadow-sm" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-neutral-900"></div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-white">{user.displayName}</p>
              {isAdmin ? (
                <span className="inline-block px-1.5 py-0.5 bg-white text-black text-[9px] font-black rounded uppercase tracking-tighter">Admin</span>
              ) : isExecutive ? (
                <span className="inline-block px-1.5 py-0.5 bg-neutral-700 text-white text-[9px] font-black rounded uppercase tracking-tighter">Executive</span>
              ) : (
                <span className="text-[10px] text-neutral-400 font-medium">Club Member</span>
              )}
            </div>
            <button onClick={logout} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-black/5 flex items-center justify-between px-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 ${activeTab === 'chat' ? 'bg-black' : activeTab === 'notices' ? 'bg-neutral-800' : 'bg-neutral-300'} rounded-full`}></div>
            <h2 className="font-black text-xl text-black tracking-tight">
              {activeTab === 'chat' ? (selectedRoom ? (selectedRoom.name || 'Direct Message') : '임원톡방') : 
               activeTab === 'members' ? '회원 명부' : 
               activeTab === 'supervision' ? '채팅 감독 모드' : '공지사항'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {activeTab === 'chat' && (
              <button 
                onClick={() => setShowRoomCreation(true)}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-bold rounded-full shadow-md hover:bg-neutral-800 transition-all active:scale-95"
              >
                <Plus className="h-3 w-3" />
                새 채팅방
              </button>
            )}
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-300" />
              <input 
                type="text" 
                placeholder="검색..." 
                className="rounded-full bg-neutral-50 py-2 pl-10 pr-4 text-sm border-transparent focus:border-neutral-200 focus:bg-white focus:ring-4 focus:ring-neutral-50 border transition-all"
              />
            </div>
          </div>
        </header>

        {activeTab === 'chat' || activeTab === 'supervision' ? (
          <>
            <div className="flex-1 overflow-y-auto p-8 lg:p-10 bg-slate-50 scroll-smooth" ref={scrollRef}>
              <div className="flex flex-col gap-8 max-w-5xl mx-auto">
                {!selectedRoom && activeTab === 'chat' ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-300 space-y-4 py-20">
                    <Bot className="h-16 w-16 opacity-20" />
                    <p className="font-black uppercase tracking-widest text-sm">대상을 선택하여 대화를 시작하세요</p>
                    <button onClick={() => setShowRoomCreation(true)} className="px-6 py-2 bg-white border border-slate-200 rounded-full text-slate-400 font-bold hover:bg-slate-50 transition-colors">Start Chatting</button>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-center my-4">
                      <span className="px-4 py-1 bg-white border border-slate-200 rounded-full text-[10px] text-slate-400 font-bold uppercase tracking-widest shadow-sm">
                        {activeTab === 'supervision' ? 'Supervision Protocol Active' : 'End-to-End Encrypted'}
                      </span>
                    </div>

                    <AnimatePresence>
                      {messages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`group flex items-start gap-4 ${msg.senderId === user.uid ? 'flex-row-reverse' : ''}`}
                        >
                          <img 
                            src={msg.senderPhoto} 
                            alt="" 
                            className={`h-11 w-11 shrink-0 rounded-2xl object-cover shadow-md border-2 ${
                              msg.senderId === ADMIN_EMAIL ? 'border-black' : 'border-neutral-50'
                            }`} 
                          />
                          <div className={`max-w-[75%] space-y-1 ${msg.senderId === user.uid ? 'items-end' : ''}`}>
                            <div className={`flex items-baseline gap-2 ${msg.senderId === user.uid ? 'flex-row-reverse' : ''}`}>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${msg.senderId === user.uid ? 'text-neutral-500' : 'text-black'}`}>
                                {msg.senderName}
                                {msg.senderId === ADMIN_EMAIL && <span className="ml-1 text-[8px] bg-black text-white px-1 rounded">ADMIN</span>}
                              </span>
                              <span className="text-[9px] text-neutral-300 font-bold uppercase transition-opacity opacity-0 group-hover:opacity-100">
                                {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="group relative">
                              <div className={`px-5 py-3 rounded-3xl shadow-sm border leading-relaxed text-sm ${
                                msg.senderId === user.uid 
                                  ? 'bg-black text-white rounded-tr-none border-transparent' 
                                  : 'bg-neutral-50 text-black rounded-tl-none border-neutral-100'
                              }`}>
                                {msg.attachment && (
                                  <div className={`mb-3 p-3 rounded-2xl border flex flex-col gap-2 ${msg.senderId === user.uid ? 'bg-white/10 border-white/20' : 'bg-white border-neutral-200'}`}>
                                    <div className="flex items-center gap-3">
                                      {msg.attachment.type.startsWith('image/') ? (
                                        <ImageIcon className="h-4 w-4" />
                                      ) : msg.attachment.type.includes('pdf') ? (
                                        <FileText className="h-4 w-4" />
                                      ) : msg.attachment.type.includes('python') || msg.attachment.name.endsWith('.py') ? (
                                        <Code2 className="h-4 w-4" />
                                      ) : (
                                        <Paperclip className="h-4 w-4" />
                                      )}
                                      <span className="text-[10px] font-black truncate max-w-[150px] uppercase tracking-tighter">{msg.attachment.name}</span>
                                    </div>
                                    {msg.attachment.type.startsWith('image/') && (
                                      <img src={msg.attachment.url} alt="" className="max-h-64 rounded-xl object-contain bg-neutral-900/5 shadow-inner" />
                                    )}
                                    <a 
                                      href={msg.attachment.url} 
                                      download={msg.attachment.name}
                                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black tracking-[0.2em] uppercase transition-all ${
                                        msg.senderId === user.uid ? 'bg-white text-black hover:bg-neutral-100' : 'bg-black text-white hover:bg-neutral-800'
                                      }`}
                                    >
                                      <Download className="h-3 w-3" />
                                      DOWNLOAD FILE
                                    </a>
                                  </div>
                                )}
                                <div className="font-medium">{msg.text}</div>
                                <div className={`mt-1 text-[8px] font-mono opacity-30 ${msg.senderId === user.uid ? 'text-right' : 'text-left'}`}>
                                  {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </div>
                              </div>
                              <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                                msg.senderId === user.uid ? '-left-16' : '-right-16'
                              }`}>
                                {isAdmin && (
                                  <>
                                    <button 
                                      onClick={() => handleWarnUser(msg.senderId)}
                                      className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-black transition-all"
                                    >
                                      <AlertTriangle className="h-4 w-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteMessage(msg.id)}
                                      className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-red-500 transition-all"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </>
                )}
              </div>
            </div>

            {selectedRoom && activeTab === 'chat' && (
              <footer className="p-6 bg-white border-t border-neutral-100">
                <div className="mx-auto max-w-4xl space-y-4">
                  {attachment && (
                    <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                      <div className="flex items-center gap-3">
                        <Paperclip className="h-4 w-4 text-neutral-400" />
                        <span className="text-xs font-bold text-black truncate max-w-[200px]">{attachment.name}</span>
                        <span className="text-[10px] text-neutral-400 font-mono">{(attachment.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <button onClick={() => setAttachment(null)} className="p-1 hover:bg-neutral-200 rounded-full">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <form onSubmit={handleSendMessage} className="flex items-center relative gap-3">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                    />
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      className="p-3 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-2xl transition-all"
                    >
                      <Paperclip className="h-6 w-6" />
                    </button>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="메시지를 입력하세요..."
                      className="flex-1 px-6 py-4 bg-neutral-100 border-transparent focus:border-neutral-200 focus:bg-white focus:ring-4 focus:ring-neutral-50 rounded-2xl text-sm transition-all shadow-inner"
                    />
                    <button 
                      type="submit"
                      disabled={!newMessage.trim() && !attachment}
                      className="px-6 py-4 bg-black text-white font-black rounded-2xl shadow-lg hover:bg-neutral-800 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:hover:scale-100"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </form>
                </div>
              </footer>
            )}
          </>
        ) : activeTab === 'notices' ? (
          <div className="flex-1 overflow-y-auto p-8 lg:p-10 bg-white">
            <div className="mx-auto max-w-4xl space-y-8">
              {isAdmin && (
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-neutral-100">
                  <h3 className="text-lg font-black text-black mb-6 flex items-center gap-2">
                    <Volume2 className="h-5 w-5" />
                    새 공지사항 작성
                  </h3>
                  <form onSubmit={handlePostNotice} className="space-y-4">
                    <input 
                      type="text" 
                      placeholder="제목을 입력하세요"
                      value={noticeForm.title}
                      onChange={(e) => setNoticeForm({...noticeForm, title: e.target.value})}
                      className="w-full px-5 py-3 bg-neutral-50 border-transparent rounded-2xl font-bold focus:ring-4 focus:ring-black/5"
                    />
                    <textarea 
                      placeholder="공지 내용을 입력하세요..."
                      rows={4}
                      value={noticeForm.content}
                      onChange={(e) => setNoticeForm({...noticeForm, content: e.target.value})}
                      className="w-full px-5 py-3 bg-neutral-50 border-transparent rounded-2xl font-medium focus:ring-4 focus:ring-black/5"
                    ></textarea>
                    <button type="submit" className="w-full py-4 bg-black text-white font-black rounded-2xl shadow-lg hover:bg-neutral-800 transition-all">공지 게재하기</button>
                  </form>
                </div>
              )}

              <div className="space-y-6">
                {notices.map(notice => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={notice.id} 
                    className="bg-white rounded-[32px] p-8 shadow-sm border border-neutral-100 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="text-xl font-black text-black leading-tight tracking-tighter">{notice.title}</h4>
                      <span className="text-[10px] text-neutral-400 font-bold uppercase bg-neutral-50 px-2 py-1 rounded-full">
                        {notice.createdAt?.toDate().toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-neutral-600 leading-relaxed font-medium whitespace-pre-wrap text-sm">{notice.content}</p>
                  </motion.div>
                ))}
                {notices.length === 0 && (
                  <div className="text-center py-20 text-neutral-300">
                    <Bell className="h-16 w-16 mx-auto mb-4 opacity-10" />
                    <p className="font-black uppercase tracking-widest text-xs">현재 게재된 공지사항이 없습니다</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Members View */
          <div className="flex-1 overflow-y-auto p-8 lg:p-10 bg-white">
            <div className="mx-auto max-w-5xl space-y-6">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {members.map((member) => (
                  <motion.div 
                    layout
                    key={member.uid}
                    className="group relative overflow-hidden rounded-[32px] bg-white border border-neutral-100 p-8 shadow-sm hover:shadow-xl transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <img src={member.photoURL} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-neutral-50" />
                      {(isAdmin || member.uid === user.uid) && (
                        <button 
                          onClick={() => setEditingMember(member)}
                          className="p-2 rounded-xl bg-neutral-50 text-neutral-400 hover:bg-black hover:text-white transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div>
                      <h3 className="font-black text-lg text-black leading-tight tracking-tight">
                        {member.realName || member.displayName}
                        {member.isAdmin && <span className="ml-2 inline-block bg-black text-white text-[9px] px-1.5 rounded-full font-black uppercase">ADMIN</span>}
                        {!member.isAdmin && member.isExecutive && <span className="ml-2 inline-block bg-neutral-100 text-neutral-600 text-[9px] px-1.5 rounded-full font-black uppercase">EXEC</span>}
                      </h3>
                      <p className="text-neutral-400 text-[10px] font-bold uppercase tracking-widest mt-1">{member.role || 'Member'}</p>
                    </div>
                    <div className="mt-8 space-y-3 border-t border-neutral-50 pt-6">
                      <div className="flex justify-between text-[10px] items-center">
                        <span className="text-neutral-400 font-bold uppercase tracking-widest">Email</span>
                        <span className="text-black font-bold truncate max-w-[150px]">{member.email}</span>
                      </div>
                      <div className="flex justify-between text-[10px] items-center">
                        <span className="text-neutral-400 font-bold uppercase tracking-widest">Student ID</span>
                        <span className="text-black font-bold">{member.studentId || 'N/A'}</span>
                      </div>
                      {isAdmin && (
                        <div className="flex justify-between items-center pt-3 mt-3 border-t border-neutral-50">
                          <span className="text-neutral-400 font-black text-[10px] uppercase tracking-widest">Warnings</span>
                          <span className={`px-2 py-0.5 rounded-full font-black text-xs ${member.warnings && member.warnings > 0 ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-400'}`}>
                            {member.warnings || 0}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Onboarding Modal */}
        <AnimatePresence>
          {showOnboarding && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md bg-white rounded-[40px] p-12 shadow-2xl space-y-10"
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-neutral-100 rounded-3xl mx-auto flex items-center justify-center mb-6">
                    <Settings className="h-8 w-8 text-black" />
                  </div>
                  <h2 className="text-3xl font-black text-black tracking-tighter">회원 정보 등록</h2>
                  <p className="text-neutral-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-3">Initial Protocol Setup</p>
                </div>

                <form onSubmit={handleOnboarding} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">보이는 이름 (실명 추천)</label>
                    <input 
                      type="text"
                      required
                      value={onboardingData.realName}
                      onChange={(e) => setOnboardingData({...onboardingData, realName: e.target.value})}
                      className="w-full px-6 py-4 bg-neutral-50 border-transparent rounded-2xl font-bold focus:ring-4 focus:ring-black/5 transition-all"
                      placeholder="홍길동"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">전화번호</label>
                    <input 
                      type="tel"
                      required
                      value={onboardingData.phoneNumber}
                      onChange={(e) => setOnboardingData({...onboardingData, phoneNumber: e.target.value})}
                      className="w-full px-6 py-4 bg-neutral-50 border-transparent rounded-2xl font-bold focus:ring-4 focus:ring-black/5 transition-all"
                      placeholder="010-0000-0000"
                    />
                  </div>
                  <button type="submit" className="w-full py-5 bg-black text-white font-black rounded-2xl shadow-xl hover:bg-neutral-800 transition-all hover:scale-105 active:scale-95">시작하기</button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Room Creation Modal */}
        <AnimatePresence>
          {showRoomCreation && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="w-full max-w-lg bg-white rounded-[40px] p-8 shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-white"
              >
                <div className="flex items-center justify-between mb-8 px-2">
                  <h2 className="text-2xl font-black text-black tracking-tighter">새 대화 시작</h2>
                  <button onClick={() => setShowRoomCreation(false)} className="p-3 hover:bg-neutral-100 rounded-2xl transition-all"><X className="h-6 w-6" /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto mb-8 pr-2 space-y-2">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] px-4 mb-4">대화 상대를 선택하세요</p>
                  {members.filter(m => m.uid !== user.uid).map(member => (
                    <div 
                      key={member.uid}
                      onClick={() => {
                        if (selectedMembers.includes(member.uid)) {
                          setSelectedMembers(selectedMembers.filter(id => id !== member.uid));
                        } else {
                          setSelectedMembers([...selectedMembers, member.uid]);
                        }
                      }}
                      className={`flex items-center justify-between p-5 rounded-3xl cursor-pointer transition-all border ${selectedMembers.includes(member.uid) ? 'bg-neutral-900 border-black text-white shadow-lg' : 'bg-white border-neutral-100 hover:bg-neutral-50 shadow-sm'}`}
                    >
                      <div className="flex items-center gap-4">
                        <img src={member.photoURL} alt="" className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-sm" />
                        <div>
                          <p className={`font-black tracking-tight ${selectedMembers.includes(member.uid) ? 'text-white' : 'text-black'}`}>{member.realName || member.displayName}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedMembers.includes(member.uid) ? 'text-neutral-400' : 'text-neutral-400'}`}>{member.role || 'Member'}</p>
                        </div>
                      </div>
                      <div className={`w-8 h-8 rounded-2xl border-2 flex items-center justify-center transition-all ${selectedMembers.includes(member.uid) ? 'bg-white border-white' : 'border-neutral-200'}`}>
                        {selectedMembers.includes(member.uid) && <Plus className="h-5 w-5 text-black rotate-45" />}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowRoomCreation(false)}
                    className="flex-1 py-5 bg-neutral-100 text-neutral-500 font-black rounded-3xl hover:bg-neutral-200 transition-all uppercase tracking-widest text-xs"
                  >
                    취소
                  </button>
                  <button 
                    onClick={handleCreateRoom}
                    disabled={selectedMembers.length === 0}
                    className="flex-1 py-5 bg-black text-white font-black rounded-3xl hover:bg-neutral-800 transition-all disabled:opacity-50 shadow-xl uppercase tracking-widest text-xs"
                  >
                    대화방 생성
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {editingMember && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-8 border border-white"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">회원 정보 수정</h2>
                  <button onClick={() => setEditingMember(null)} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
                    <X className="h-6 w-6 text-slate-400" />
                  </button>
                </div>

                <form onSubmit={handleUpdateMember} className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                      <img src={editingMember.photoURL} alt="" className="w-12 h-12 rounded-xl" />
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Base Identity</p>
                        <p className="text-slate-900 font-black">{editingMember.displayName}</p>
                      </div>
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">이름</label>
                        <input 
                          type="text" 
                          value={editingMember.realName || ''} 
                          onChange={(e) => setEditingMember({...editingMember, realName: e.target.value})}
                          className="w-full px-4 py-3 bg-neutral-50 border-transparent rounded-xl text-sm focus:ring-4 focus:ring-black/5 transition-all font-bold"
                          placeholder="실명 입력"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">전화번호</label>
                        <input 
                          type="text" 
                          value={editingMember.phoneNumber || ''} 
                          onChange={(e) => setEditingMember({...editingMember, phoneNumber: e.target.value})}
                          className="w-full px-4 py-3 bg-neutral-50 border-transparent rounded-xl text-sm focus:ring-4 focus:ring-black/5 transition-all font-bold"
                          placeholder="010-0000-0000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">학번</label>
                        <input 
                          type="text" 
                          value={editingMember.studentId || ''} 
                          onChange={(e) => setEditingMember({...editingMember, studentId: e.target.value})}
                          className="w-full px-4 py-3 bg-neutral-50 border-transparent rounded-xl text-sm focus:ring-4 focus:ring-black/5 transition-all font-bold"
                          placeholder="학번 입력"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">주의 / 경고 횟수</label>
                        <input 
                          type="number" 
                          value={editingMember.warnings || 0} 
                          onChange={(e) => setEditingMember({...editingMember, warnings: parseInt(e.target.value) || 0})}
                          className="w-full px-4 py-3 bg-neutral-50 border-transparent rounded-xl text-sm focus:ring-4 focus:ring-black/5 transition-all font-bold"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">직책 / 역할</label>
                      <input 
                        type="text" 
                        value={editingMember.role || ''} 
                        onChange={(e) => setEditingMember({...editingMember, role: e.target.value})}
                        className="w-full px-4 py-3 bg-neutral-50 border-transparent rounded-xl text-sm focus:ring-4 focus:ring-black/5 transition-all font-bold"
                        placeholder="예: 하드웨어 엔지니어, 팀장"
                      />
                    </div>

                    {isAdmin && (
                      <div className="grid gap-3">
                        <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                          <div>
                            <p className="text-[10px] font-black text-black uppercase tracking-widest">Administrator</p>
                            <p className="text-[8px] text-neutral-500 font-medium uppercase">Master Access Control</p>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={editingMember.isAdmin} 
                            onChange={(e) => setEditingMember({...editingMember, isAdmin: e.target.checked})}
                            className="h-6 w-6 accent-black"
                          />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                          <div>
                            <p className="text-[10px] font-black text-black uppercase tracking-widest">Executive Status</p>
                            <p className="text-[8px] text-neutral-500 font-medium uppercase">Access to Executive room</p>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={editingMember.isExecutive} 
                            onChange={(e) => setEditingMember({...editingMember, isExecutive: e.target.checked})}
                            className="h-6 w-6 accent-black"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-5 bg-black text-white font-black rounded-2xl shadow-xl hover:bg-neutral-800 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Save className="h-5 w-5" />
                    SAVE CHANGES
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Admin Overlay */}
        {showAdminPanel && isAdmin && (
          <div className="absolute inset-0 z-30 bg-black/40 p-8 backdrop-blur-sm lg:p-12 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mx-auto max-w-2xl bg-white rounded-[40px] shadow-2xl p-10 border border-white"
            >
              <div className="mb-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-black rounded-3xl shadow-xl">
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-black tracking-tighter">Admin Services</h2>
                    <p className="text-neutral-400 text-[10px] font-bold uppercase tracking-widest">System Master Node</p>
                  </div>
                </div>
                <button onClick={() => setShowAdminPanel(false)} className="rounded-2xl bg-neutral-100 p-3 text-neutral-400 hover:bg-neutral-200 transition-colors">
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-3xl border border-neutral-100 bg-neutral-50 p-8 shadow-sm">
                  <h3 className="mb-6 font-black text-[10px] uppercase tracking-[0.2em] text-neutral-400">Core Systems</h3>
                  <ul className="space-y-4 font-mono text-[10px] font-bold uppercase">
                    <li className="flex justify-between items-center">
                      <span className="text-neutral-400">Database</span>
                      <span className="text-black bg-neutral-200 px-2 py-0.5 rounded">ONLINE</span>
                    </li>
                    <li className="flex justify-between items-center">
                      <span className="text-neutral-400">Encryption</span>
                      <span className="text-black bg-neutral-200 px-2 py-0.5 rounded">ACTIVE</span>
                    </li>
                    <li className="flex justify-between items-center">
                      <span className="text-neutral-400">Access Level</span>
                      <span className="text-black bg-neutral-200 px-2 py-0.5 rounded">LATEST</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-3xl border border-neutral-100 bg-black p-8 shadow-xl text-white">
                  <h3 className="mb-6 font-black text-[10px] uppercase tracking-[0.2em] text-neutral-500">Club Management</h3>
                  <p className="text-sm text-neutral-300 leading-relaxed font-bold">
                    Connected Nodes: <span className="text-white text-xl ml-2">{members.length}</span>
                  </p>
                  <button 
                    onClick={() => { setActiveTab('members'); setShowAdminPanel(false); }}
                    className="mt-6 w-full py-4 bg-white text-black text-xs font-black rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-95 uppercase tracking-widest"
                  >
                    Access Roster
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        <footer className="h-10 bg-white border-t border-neutral-100 flex items-center justify-between px-8">
          <div className="flex items-center gap-6 text-[9px] text-neutral-400 font-bold uppercase tracking-[0.3em]">
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-black rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"></div> Network Stable</span>
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-black rounded-full"></div> Kernel 2.1.0</span>
          </div>
          <div className="text-[9px] text-neutral-300 font-bold uppercase tracking-widest">Monochrome Interface Protocol</div>
        </footer>
      </main>
    </div>
  );
}
