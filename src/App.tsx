import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { Plus, Settings, Search, BookOpen, Calendar, CheckCircle2, Loader2, Save, Library, ChevronLeft, Camera, BookKey, MessageSquare, Sparkles } from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyDEPLBPPaaJuaYCKwAZvQN4SakVsK28faQ",
  authDomain: "jisan-s-book.firebaseapp.com",
  projectId: "jisan-s-book",
  storageBucket: "jisan-s-book.firebasestorage.app",
  messagingSenderId: "1056282914754",
  appId: "1:1056282914754:web:8c201a294275d51971f05b",
  measurementId: "G-L7YZYEQSY4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const PAGE_THICKNESS_CM = 0.005; 
const HEIGHT_COMPARISONS = [
  { max: 0, name: '아직 빈 책상', heightStr: '0cm', icon: '🪹' }, 
  { max: 5, name: '지우개', heightStr: '3cm', icon: '🧽' },
  { max: 10, name: '사과', heightStr: '8cm', icon: '🍎' },
  { max: 15, name: '머그컵', heightStr: '13.38cm', icon: '☕' },
  { max: 20, name: '각티슈', heightStr: '15cm', icon: '🤧' },
  { max: 35, name: '아이패드', heightStr: '25cm', icon: '📱' },
  { max: 70, name: '모니터', heightStr: '45cm', icon: '🖥️' },
  { max: 150, name: '기타 (Guitar)', heightStr: '100cm', icon: '🎸' },
  { max: 300, name: '황제펭귄', heightStr: '120cm', icon: '🐧' },
  { max: Infinity, name: '기린', heightStr: '400cm', icon: '🦒' },
];

const DEFAULT_COLORS = ['#FCD34D', '#FCA5A5', '#86EFAC', '#93C5FD', '#D8B4FE', '#F472B6', '#FDE047', '#E5E7EB'];
const getRandomColor = () => DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];

const BookStackLogo = () => (
  <svg viewBox="0 0 100 100" className="w-9 h-9 drop-shadow-sm" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(10, 50) rotate(-6)">
      <path d="M5,15 L75,5 L95,15 L25,25 Z" fill="#3b82f6" />
      <path d="M5,15 L5,28 L25,38 L25,25 Z" fill="#1e3a8a" />
      <path d="M25,25 L95,15 L95,28 L25,38 Z" fill="#f1f5f9" />
      <path d="M25,32 L95,22 L95,28 L25,38 Z" fill="#cbd5e1" />
    </g>
    <g transform="translate(12, 34) rotate(4)">
      <path d="M5,15 L75,5 L95,15 L25,25 Z" fill="#ef4444" />
      <path d="M5,15 L5,28 L25,38 L25,25 Z" fill="#7f1d1d" />
      <path d="M25,25 L95,15 L95,28 L25,38 Z" fill="#f8fafc" />
      <path d="M25,32 L95,22 L95,28 L25,38 Z" fill="#e2e8f0" />
    </g>
    <g transform="translate(14, 15) rotate(-3)">
      <path d="M5,15 L75,5 L95,15 L25,25 Z" fill="#22c55e" />
      <path d="M5,15 L5,28 L25,38 L25,25 Z" fill="#14532d" />
      <path d="M25,25 L95,15 L95,28 L25,38 Z" fill="#ffffff" />
      <path d="M25,32 L95,22 L95,28 L25,38 Z" fill="#f1f5f9" />
    </g>
  </svg>
);

const callGeminiAPI = async (prompt: string, apiKey: string, imageBase64: string | null = null, history: any[] = []) => {
  if (!apiKey) return null;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  let contents: any[] = [];
  if (history.length > 0) {
    contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));
    contents.push({ role: "user", parts: [{ text: prompt }] });
  } else if (imageBase64) {
    contents = [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: imageBase64.split(',')[1] } }] }];
  } else {
    contents = [{ parts: [{ text: prompt }] }];
  }

  try {
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents }) });
    if (!response.ok) return null;
    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch(e) { 
    return null; 
  }
};

// 구글 도서 API로 쪽수 자동 조회 (AI 토큰 낭비 방지)
const fetchPageCountFromGoogleBooks = async (title: string, authors: string) => {
  try {
    const query = `${title} ${authors}`.trim();
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        if (item.volumeInfo?.pageCount) {
          return item.volumeInfo.pageCount;
        }
      }
    }
  } catch (e) {
    console.error("Google Books API Error:", e);
  }
  return 250; // 기본값
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [currentTab, setCurrentTab] = useState('tower'); 
  const [selectedBook, setSelectedBook] = useState<any>(null);
  
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [kakaoApiKey, setKakaoApiKey] = useState(localStorage.getItem('kakao_api_key') || '');
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (error) { console.error("Auth Error:", error); }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const booksRef = collection(db, 'users', user.uid, 'books');
    const unsubscribeBooks = onSnapshot(booksRef, (snapshot) => {
      const booksData: any[] = [];
      snapshot.forEach((doc) => booksData.push({ ...doc.data(), id: doc.id }));
      setBooks(booksData);
    });

    const fetchKeys = async () => {
      try {
        const keysDoc = await getDoc(doc(db, 'users', user.uid, 'settings', 'keys'));
        if(keysDoc.exists()) {
          const data = keysDoc.data();
          if(data.gemini && !localStorage.getItem('gemini_api_key')) { setApiKey(data.gemini); localStorage.setItem('gemini_api_key', data.gemini); }
          if(data.kakao && !localStorage.getItem('kakao_api_key')) { setKakaoApiKey(data.kakao); localStorage.setItem('kakao_api_key', data.kakao); }
        }
      } catch(e){}
    }
    fetchKeys();

    return () => unsubscribeBooks();
  }, [user]);

  const saveKeysToDb = async (gemini: string, kakao: string) => {
    localStorage.setItem('gemini_api_key', gemini);
    localStorage.setItem('kakao_api_key', kakao);
    setApiKey(gemini);
    setKakaoApiKey(kakao);
    if(user) {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'keys'), { gemini, kakao }, { merge: true });
    }
  };

  const handleBookAdd = (newBook: any) => {
    setSelectedBook(newBook);
    setCurrentTab(newBook.status === 'finished' ? 'tower' : 'desk'); 
  };

  if (isLoadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]"><Loader2 className="animate-spin text-[#451A03]" size={40} /></div>;
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-[#451A03] pb-24 selection:bg-[#FDE047]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&family=Noto+Sans+KR:wght@400;600;700;900&display=swap');
        * { touch-action: manipulation; }
        .handwriting-title { font-family: 'Nanum Pen Script', cursive; font-size: 2.2rem; letter-spacing: 0.5px; }
        
        .sketch-border { 
          border: 2px solid #451A03; 
          border-radius: 255px 15px 225px 15px/15px 225px 15px 255px; 
        }
        
        .book-spine-solid { 
          border: 2px solid #451A03; 
          border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
          position: relative;
          box-shadow: inset -2px -2px 5px rgba(0,0,0,0.05), 1px 2px 0px rgba(69, 26, 3, 0.1);
        }
        .book-spine-dashed {
          border: 2px dashed #451A03; 
          border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
          position: relative;
          opacity: 0.7;
        }
        .book-spine-solid::after, .book-spine-dashed::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 10%, rgba(0,0,0,0.02) 90%, rgba(0,0,0,0.08) 100%);
          border-radius: inherit; pointer-events: none;
        }
        input, textarea, [contenteditable] { font-family: 'Noto Sans KR', sans-serif; }
        
        .receipt-paper {
          background-color: #ffffff;
          border: 1px solid #d1d5db;
          box-shadow: 0 4px 6px rgba(0,0,0,0.05);
          position: relative;
          font-family: 'Courier New', Courier, monospace;
          color: #374151;
        }

        #netlify-badge, a[href*="netlify.com"] {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `}</style>

      <header className="sticky top-0 bg-[#FDFBF7]/95 backdrop-blur-md z-30 p-4 flex justify-between items-center max-w-2xl mx-auto border-b-2 border-[#451A03]/10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={()=>setCurrentTab('tower')}>
          <BookStackLogo />
          <h1 className="text-[#451A03] font-bold handwriting-title mt-1.5">지산의 서재</h1>
        </div>
        {(currentTab === 'detail' || currentTab === 'addForm') && (
          <button onClick={() => setCurrentTab('tower')} className="text-xs font-bold text-[#451A03] bg-white px-3 py-1.5 rounded-full sketch-border flex items-center hover:bg-[#FDE047] transition-colors shadow-sm cursor-pointer">
            <ChevronLeft className="w-4 h-4 mr-0.5" /> 메인으로
          </button>
        )}
      </header>

      <main className="max-w-2xl mx-auto p-4 font-['Noto_Sans_KR']">
        {currentTab === 'tower' && <BookTowerView books={books} onSelect={(b: any) => { setSelectedBook(b); setCurrentTab('detail'); }} onAdd={()=>setCurrentTab('search')} apiKey={apiKey} />}
        {currentTab === 'desk' && <DeskView books={books} onSelect={(b: any) => { setSelectedBook(b); setCurrentTab('detail'); }} user={user} setTab={setCurrentTab} />}
        {currentTab === 'search' && <BookSearchView kakaoApiKey={kakaoApiKey} onSelectForAdd={async (b: any) => {
          const pages = await fetchPageCountFromGoogleBooks(b.title, b.authors);
          setSelectedBook({ ...b, pageCount: pages });
          setCurrentTab('addForm');
        }} />}
        {currentTab === 'addForm' && <BookAddFormView user={user} initialBook={selectedBook} onSaved={handleBookAdd} />}
        {currentTab === 'detail' && selectedBook && <BookDetailView key={selectedBook.id} user={user} book={selectedBook} apiKey={apiKey} onClose={() => setCurrentTab(selectedBook?.status === 'reading' ? 'desk' : 'tower')} />}
        {currentTab === 'record' && <RecordView books={books} />}
        {currentTab === 'settings' && <SettingsView apiKey={apiKey} kakaoApiKey={kakaoApiKey} saveKeysToDb={saveKeysToDb} />}
      </main>

      <nav className="fixed bottom-0 w-full bg-[#FDFBF7] border-t-[2.5px] border-[#451A03] p-2 flex justify-around items-center z-20 max-w-2xl mx-auto left-0 right-0 shadow-[0_-4px_0px_rgba(69,26,3,0.03)]">
        <NavBtn icon={<Library className={currentTab === 'tower' ? 'fill-[#FDE047]' : ''}/>} label="내 서재" active={currentTab === 'tower'} onClick={() => setCurrentTab('tower')} />
        <NavBtn icon={<BookOpen className={currentTab === 'desk' ? 'fill-[#FDE047]' : ''}/>} label="내 책상" active={currentTab === 'desk'} onClick={() => setCurrentTab('desk')} />
        <NavBtn icon={<Plus className="w-8 h-8 text-[#451A03]" strokeWidth={3} />} active={false} onClick={() => setCurrentTab('search')} isPrimary={true} />
        <NavBtn icon={<Calendar className={currentTab === 'record' ? 'fill-[#FDE047]' : ''}/>} label="기록" active={currentTab === 'record'} onClick={() => setCurrentTab('record')} />
        <NavBtn icon={<Settings className={currentTab === 'settings' ? 'text-[#FDE047]' : ''}/>} label="설정" active={currentTab === 'settings'} onClick={() => setCurrentTab('settings')} />
      </nav>
    </div>
  );
}

const NavBtn = ({ icon, label, active, onClick, isPrimary = false }: { icon: any, label?: string, active: boolean, onClick: () => void, isPrimary?: boolean }) => (
  <button onClick={onClick} className={`flex flex-col items-center transition-transform active:scale-95 cursor-pointer ${isPrimary ? '-mt-7' : ''}`}>
    <div className={`p-2.5 rounded-2xl flex items-center justify-center ${isPrimary ? 'bg-[#FDE047] sketch-border shadow-[2px_3px_0px_rgba(69,26,3,1)] hover:bg-[#FCD34D]' : active ? 'text-[#451A03] bg-stone-200/40 sketch-border' : 'text-[#451A03]/40'}`}>
      {icon}
    </div>
    {!isPrimary && <span className={`text-[10px] font-bold mt-1 ${active ? 'text-[#451A03]' : 'text-[#451A03]/50'}`}>{label}</span>}
  </button>
);

const BookTowerView = ({ books, onSelect, onAdd, apiKey }: { books: any[], onSelect: any, onAdd: any, apiKey: string }) => {
  const [filter, setFilter] = useState('all'); 
  const [recommendModal, setRecommendModal] = useState(false);
  const [recommendText, setRecommendText] = useState('');
  const [isRecLoading, setIsRecLoading] = useState(false);

  const displayBooks = books.filter(b => b.status === 'finished' || b.status === 'abandoned');
  const finishedCount = books.filter(b => b.status === 'finished').length;
  
  const filteredBooks = displayBooks.filter(b => {
    if(filter === 'all') return true;
    const d = new Date(b.endDate || b.createdAt);
    const now = new Date();
    if(filter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if(filter === 'year') return d.getFullYear() === now.getFullYear();
    return true;
  });

  filteredBooks.sort((a, b) => new Date(a.endDate || a.createdAt).getTime() - new Date(b.endDate || b.createdAt).getTime());

  const totalPages = filteredBooks.reduce((sum, b) => sum + (b.status === 'abandoned' ? (Number(b.currentPage)||0) : (Number(b.pageCount)||0)), 0);
  const totalHeight = totalPages * PAGE_THICKNESS_CM;
  const comp = HEIGHT_COMPARISONS.find(c => totalHeight <= c.max) || HEIGHT_COMPARISONS[HEIGHT_COMPARISONS.length - 1];

  const handleAiRecommend = async () => {
    if (!apiKey) {
      alert("설정 탭에서 Gemini API 키를 먼저 입력해주세요!");
      return;
    }
    setIsRecLoading(true);
    setRecommendModal(true);
    const finishedList = books.filter(b => b.status === 'finished').map(b => `${b.title} (${b.authors})`).join(', ');
    const prompt = `사용자가 지금까지 완독한 책 목록이야: [${finishedList}]. 이 책들의 취향을 분석해서, 다음에 읽으면 좋을 책 3권을 재치 있는 한줄평과 함께 추천해줘. 친근한 말투로 대답해줘.`;
    const res = await callGeminiAPI(prompt, apiKey);
    setRecommendText(res || "추천을 불러오지 못했어요.");
    setIsRecLoading(false);
  };

  return (
    <div className="flex flex-col items-center min-h-[75vh] pb-10 animate-in fade-in">
      {/* 5권 완독 달성 배너 */}
      {finishedCount > 0 && finishedCount % 5 === 0 && (
        <div className="w-full bg-[#FDE047] sketch-border p-4 mb-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#451A03]" />
            <span className="text-xs font-black">완독 {finishedCount}권 달성! AI 추천 북을 받아보세요 ✨</span>
          </div>
          <button onClick={handleAiRecommend} className="bg-[#451A03] text-white px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer">추천받기</button>
        </div>
      )}

      <div className="flex gap-2 mb-4 w-full">
        <button onClick={()=>setFilter('all')} className={`flex-1 py-2 rounded-xl sketch-border text-xs font-bold cursor-pointer ${filter==='all'?'bg-white shadow-[2px_2px_0px_#451A03]':'bg-transparent text-[#451A03]/40 border-dashed'}`}>전체보기</button>
        <button onClick={()=>setFilter('month')} className={`flex-1 py-2 rounded-xl sketch-border text-xs font-bold cursor-pointer ${filter==='month'?'bg-white shadow-[2px_2px_0px_#451A03]':'bg-transparent text-[#451A03]/40 border-dashed'}`}>이번 달</button>
        <button onClick={()=>setFilter('year')} className={`flex-1 py-2 rounded-xl sketch-border text-xs font-bold cursor-pointer ${filter==='year'?'bg-white shadow-[2px_2px_0px_#451A03]':'bg-transparent text-[#451A03]/40 border-dashed'}`}>올해</button>
      </div>

      <div className="w-full bg-white sketch-border p-5 mb-8 flex items-center justify-between shadow-[3px_3px_0px_rgba(69,26,3,0.1)]">
        <div>
          <p className="text-xs text-[#451A03]/60 mb-1 font-bold">지금까지 쌓은 책 높이</p>
          <p className="text-3xl font-black text-[#451A03]">{totalHeight.toFixed(2)}<span className="text-lg font-bold ml-1">cm</span></p>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="text-3xl mb-1">{comp.icon}</div>
          <div className="bg-[#FDE047]/30 text-[#451A03] text-xs font-bold px-2.5 py-1 rounded-lg border-2 border-[#451A03]/10">
            {comp.name} 높이
          </div>
        </div>
      </div>

      <button onClick={onAdd} className="w-full bg-[#FDE047] sketch-border py-4 mb-6 rounded-2xl font-black text-[#451A03] shadow-[3px_3px_0px_#451A03] flex items-center justify-center gap-2 hover:bg-[#FCD34D] transition-transform active:translate-y-1 active:shadow-none cursor-pointer">
        <Plus className="w-5 h-5"/> 책 추가하기
      </button>

      {filteredBooks.length === 0 ? (
        <div className="mt-6 text-center text-[#451A03]/60 flex flex-col items-center p-8 bg-white/50 sketch-border border-dashed rounded-3xl">
          <Library className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-bold text-sm">이 기간에 다 읽은 책이 없어요.</p>
        </div>
      ) : (
        <div className="flex flex-col-reverse items-center w-full max-w-sm gap-1 mt-auto">
          <div className="w-full h-3 bg-[#451A03] rounded-full mt-2 shadow-sm border-2 border-[#451A03]/20"></div>
          
          {filteredBooks.map((book, idx) => {
            const widthPct = 85 + (book.id.charCodeAt(0) % 15);
            let effectivePages = book.status === 'abandoned' ? (Number(book.currentPage)||30) : (Number(book.pageCount) || 250);
            effectivePages = Math.max(50, effectivePages);
            const heightPx = Math.max(28, Math.min(60, effectivePages / 7));
            const isAbandoned = book.status === 'abandoned';
            
            return (
              <div 
                key={book.id}
                onClick={() => onSelect(book)}
                className={`cursor-pointer transition-transform hover:scale-[1.02] flex items-center justify-center overflow-hidden ${isAbandoned ? 'book-spine-dashed' : 'book-spine-solid'}`}
                style={{
                  backgroundColor: book.spineColor || '#FCD34D',
                  width: `${widthPct}%`,
                  height: `${heightPx}px`,
                  zIndex: idx
                }}
              >
                <span className="font-bold text-sm truncate px-4 whitespace-nowrap drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]" style={{ color: book.textColor || '#451A03' }}>
                  {book.displayTitle || book.title}
                </span>
                {isAbandoned && <div className="absolute right-2 text-[10px] bg-white/70 px-1.5 rounded text-[#451A03] font-bold border border-[#451A03]/30">중단</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* AI 추천 모달 */}
      {recommendModal && (
        <div className="fixed inset-0 bg-[#451A03]/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FDFBF7] sketch-border p-6 w-full max-w-md shadow-xl flex flex-col max-h-[80vh]">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#451A03]" /> AI 맞춤 책 추천</h3>
            <div className="flex-1 overflow-y-auto text-sm space-y-3 bg-white p-4 sketch-border mb-4 whitespace-pre-wrap leading-relaxed">
              {isRecLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#451A03]" /></div> : recommendText}
            </div>
            <button onClick={() => setRecommendModal(false)} className="w-full py-3 bg-[#FDE047] sketch-border font-bold text-xs cursor-pointer">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
};

const DeskView = ({ books, onSelect, user, setTab }: { books: any[], onSelect: any, user: any, setTab: any }) => {
  const readingBooks = books.filter(b => b.status === 'reading');
  const [abandonModal, setAbandonModal] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState('');
  const [reason, setReason] = useState('');

  const handleAbandon = async () => {
    if(!user || !abandonModal) return;
    const bookRef = doc(db, 'users', user.uid, 'books', abandonModal.id);
    await setDoc(bookRef, { 
      status: 'abandoned', 
      currentPage: Number(currentPage)||0, 
      abandonReason: reason,
      endDate: new Date().toISOString().split('T')[0]
    }, { merge: true });
    setAbandonModal(null);
    setTab('tower');
  };

  return (
    <div className="animate-in fade-in pb-10">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5 text-[#FDE047] fill-current"/> 내 책상 (읽는 중)</h2>
      
      {readingBooks.length === 0 ? (
        <div className="text-center text-[#451A03]/60 flex flex-col items-center p-8 bg-white/50 sketch-border border-dashed rounded-3xl mt-10">
          <BookOpen className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-bold text-sm mb-4">지금 읽고 있는 책이 없어요.</p>
          <button onClick={() => setTab('search')} className="text-xs bg-white sketch-border px-4 py-2 font-bold hover:bg-[#FDE047] cursor-pointer">새 책 꺼내기</button>
        </div>
      ) : (
        <div className="space-y-4">
          {readingBooks.map((book: any) => (
            <div key={book.id} className="bg-white p-4 rounded-2xl sketch-border flex flex-col gap-3 shadow-[3px_3px_0px_rgba(69,26,3,0.05)]">
              <div className="flex gap-4 cursor-pointer" onClick={() => onSelect(book)}>
                {book.thumbnail ? <img src={book.thumbnail} alt="cover" className="w-16 h-24 object-cover rounded shadow-sm border border-[#451A03]/10" /> : <div className="w-16 h-24 bg-stone-100 rounded border border-[#451A03]/10 flex items-center justify-center text-[10px]">표지 없음</div>}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[15px] truncate mb-1">{book.title}</h3>
                  <p className="text-xs text-[#451A03]/60 truncate mb-2">{book.authors} | {book.publisher}</p>
                  <div className="text-xs font-bold bg-[#FDE047]/30 inline-block px-2 py-1 rounded-md border border-[#451A03]/10">
                    총 {book.pageCount}쪽
                  </div>
                </div>
              </div>
              <div className="flex gap-2 border-t-2 border-dashed border-[#451A03]/10 pt-3">
                <button onClick={() => setAbandonModal(book)} className="flex-1 py-2 text-xs font-bold text-[#451A03]/60 bg-white hover:bg-stone-100 rounded-xl transition-colors cursor-pointer">포기할래요 🏳️</button>
                <button onClick={() => onSelect(book)} className="flex-1 py-2 text-xs font-bold bg-[#FDE047] text-[#451A03] sketch-border shadow-[2px_2px_0px_#451A03] rounded-xl hover:bg-[#FCD34D] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer">기록하기 ✏️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {abandonModal && (
        <div className="fixed inset-0 bg-[#451A03]/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FDFBF7] sketch-border p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-2">잠시 덮어두기 🏳️</h3>
            <p className="text-xs text-[#451A03]/70 mb-4">언제든 서재에서 다시 읽기를 누를 수 있어요.</p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold mb-1">어디까지 읽으셨나요? (쪽)</label>
                <input type="number" inputMode="numeric" value={currentPage} onChange={e=>setCurrentPage(e.target.value)} spellCheck="false" className="w-full p-2.5 bg-white sketch-border text-sm" placeholder="예: 45" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">덮어두는 이유 (선택)</label>
                <input type="text" value={reason} onChange={e=>setReason(e.target.value)} spellCheck="false" className="w-full p-2.5 bg-white sketch-border text-sm" placeholder="내용이 어려워서, 지루해서..." />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setAbandonModal(null)} className="flex-1 py-2.5 bg-white sketch-border text-xs font-bold hover:bg-stone-100 cursor-pointer">취소</button>
              <button onClick={handleAbandon} className="flex-1 py-2.5 bg-red-100 border-2 border-red-300 rounded-xl text-xs font-bold text-red-700 hover:bg-red-200 cursor-pointer">서재로 보내기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const BookSearchView = ({ kakaoApiKey, onSelectForAdd }: { kakaoApiKey: string, onSelectForAdd: any }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(false);
  
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query.trim() && kakaoApiKey) performSearch(query);
      else setResults([]);
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [query, kakaoApiKey]);

  const performSearch = async (searchQuery: string) => {
    setIsSearching(true);
    try {
      let res = await fetch(`https://dapi.kakao.com/v3/search/book?query=${encodeURIComponent(searchQuery)}&size=10`, { headers: { 'Authorization': `KakaoAK ${kakaoApiKey}` } });
      let data = await res.json();
      
      if ((!data.documents || data.documents.length === 0) && searchQuery.includes(' ')) {
        const noSpaceQuery = searchQuery.replace(/\s+/g, '');
        res = await fetch(`https://dapi.kakao.com/v3/search/book?query=${encodeURIComponent(noSpaceQuery)}&size=10`, { headers: { 'Authorization': `KakaoAK ${kakaoApiKey}` } });
        data = await res.json();
      }

      if (data && data.documents) {
        const formattedResults = data.documents.map((item: any, idx: number) => ({
          id: `temp_${Date.now()}_${idx}`,
          isbn: item.isbn,
          title: item.title || '제목 없음',
          authors: item.authors?.join(', ') || '작자 미상',
          publisher: item.publisher || '출판사 모름',
          thumbnail: item.thumbnail?.replace('http:', 'https:') || null,
        }));
        setResults(formattedResults);
      }
    } catch (error) { console.error(error); }
    setIsSearching(false);
  };

  const handleSelect = async (book: any) => {
    setIsPageLoading(true);
    await onSelectForAdd(book);
    setIsPageLoading(false);
  };

  return (
    <div className="animate-in fade-in pb-10">
      <div className="flex items-center mb-6 gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2"><Search className="w-5 h-5 text-[#FDE047]"/> 어떤 책을 기록할까요?</h2>
      </div>

      {!kakaoApiKey ? (
        <div className="bg-white p-6 sketch-border space-y-4">
          <h3 className="font-bold text-sm">카카오 도서 검색 연동 필요</h3>
          <p className="text-xs text-[#451A03]/70">설정 탭에서 카카오 REST API 키를 먼저 입력해 주세요!</p>
        </div>
      ) : (
        <>
          <div className="relative mb-6">
            <input type="text" inputMode="text" spellCheck="false" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="책 제목, 저자를 검색해 보세요" className="w-full bg-white sketch-border py-3.5 pl-11 pr-4 focus:outline-none focus:border-[#FDE047] text-sm" />
            <Search className="absolute left-4 top-4 w-4 h-4 text-[#451A03]/40" />
          </div>
          
          {isSearching || isPageLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="animate-spin text-[#FDE047] w-8 h-8" />
              <p className="text-xs font-bold text-[#451A03]/60">책 정보를 불러오는 중입니다...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((book) => (
                <div key={book.id} className="flex gap-4 p-4 bg-white sketch-border items-center">
                  {book.thumbnail ? <img src={book.thumbnail} alt="cover" className="w-14 h-20 object-cover rounded shadow-sm border border-[#451A03]/10" /> : <div className="w-14 h-20 bg-stone-100 rounded border border-[#451A03]/10 flex items-center justify-center text-[10px]">표지 없음</div>}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{book.title}</h3>
                    <p className="text-[11px] text-[#451A03]/60 truncate mt-1">{book.authors} | {book.publisher}</p>
                  </div>
                  <button onClick={() => handleSelect(book)} className="bg-[#FDE047] text-[#451A03] sketch-border shadow-[2px_2px_0px_#451A03] px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-[#FCD34D] active:translate-y-0.5 active:shadow-none whitespace-nowrap cursor-pointer">
                    선택
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const BookAddFormView = ({ user, initialBook, onSaved }: { user: any, initialBook: any, onSaved: any }) => {
  const [bookData, setBookData] = useState({
    title: initialBook?.title || '',
    displayTitle: initialBook?.title || '',
    authors: initialBook?.authors || '',
    publisher: initialBook?.publisher || '',
    pageCount: initialBook?.pageCount || 250, 
    spineColor: getRandomColor(),
    textColor: '#451A03',
    format: '종이책',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    thumbnail: initialBook?.thumbnail || null
  });
  
  const [savingType, setSavingType] = useState<string | null>(null);

  const handleSave = async (status: string) => {
    if(!user) {
      alert("데이터를 저장할 수 없습니다. (네트워크/로그인 확인 필요)");
      return;
    }
    setSavingType(status);
    try {
      const newBookRef = doc(collection(db, 'users', user.uid, 'books'));
      const finalBook = {
        ...bookData,
        id: newBookRef.id,
        status,
        rating: 0,
        review: '',
        noteHtml: '',
        createdAt: Date.now()
      };
      
      await setDoc(newBookRef, finalBook);
      setSavingType(null);
      onSaved(finalBook);
    } catch(e) {
      console.error("Save Error:", e);
      alert("저장에 실패했습니다. 다시 시도해 주세요.");
      setSavingType(null);
    }
  };

  return (
    <div className="animate-in fade-in pb-10 max-w-sm mx-auto">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><BookKey className="w-5 h-5 text-[#FDE047]"/> 책 정보 작성하기</h2>
      
      <div className="bg-white p-5 sketch-border space-y-5 shadow-[3px_3px_0px_rgba(69,26,3,0.05)]">
        
        <div className="flex flex-col items-center justify-center mb-6 gap-4">
          {bookData.thumbnail ? (
            <img src={bookData.thumbnail} alt="cover preview" className="w-24 h-36 object-cover rounded shadow-md border border-[#451A03]/10" />
          ) : (
            <div className="w-24 h-36 bg-stone-100 rounded border border-[#451A03]/10 flex items-center justify-center text-xs text-[#451A03]/50">표지 없음</div>
          )}
          <div className="book-spine-solid flex items-center justify-center" style={{ backgroundColor: bookData.spineColor, width: '90%', height: '40px' }}>
             <span className="font-bold text-sm truncate px-4" style={{ color: bookData.textColor }}>{bookData.displayTitle || bookData.title}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5 text-[#451A03]/70">책등에 표시할 제목 (길면 줄여주세요)</label>
          <input type="text" value={bookData.displayTitle} onChange={e=>setBookData({...bookData, displayTitle: e.target.value})} spellCheck="false" className="w-full p-2.5 bg-white sketch-border text-sm font-bold" />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold mb-1.5 text-[#451A03]/70">책등 배경색 🎨</label>
            <input type="color" value={bookData.spineColor} onChange={e=>setBookData({...bookData, spineColor: e.target.value})} className="w-full h-10 bg-white sketch-border p-1 cursor-pointer" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold mb-1.5 text-[#451A03]/70">글자색</label>
            <input type="color" value={bookData.textColor} onChange={e=>setBookData({...bookData, textColor: e.target.value})} className="w-full h-10 bg-white sketch-border p-1 cursor-pointer" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5 text-[#451A03]/70">총 페이지 수 (자동 연동됨)</label>
          <input type="number" inputMode="numeric" value={bookData.pageCount} onChange={e=>setBookData({...bookData, pageCount: Number(e.target.value)})} className="w-full p-2.5 bg-white sketch-border text-sm" />
        </div>

        <div className="pt-4 border-t-2 border-dashed border-[#451A03]/10 flex flex-col gap-3">
          <button onClick={() => handleSave('finished')} disabled={!!savingType} className="w-full bg-[#FDE047] sketch-border py-3.5 font-black shadow-[2px_2px_0px_#451A03] hover:bg-[#FCD34D] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
            {savingType === 'finished' ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle2 className="w-4 h-4"/>} 다 읽은 책으로 추가 (서재로)
          </button>
          <button onClick={() => handleSave('reading')} disabled={!!savingType} className="w-full bg-white sketch-border py-3.5 font-bold hover:bg-stone-50 flex items-center justify-center gap-2 text-[#451A03]/80 cursor-pointer disabled:opacity-50">
            {savingType === 'reading' ? <Loader2 className="w-4 h-4 animate-spin"/> : "📖"} 읽기 시작할 책으로 추가 (내 책상으로)
          </button>
        </div>
      </div>
    </div>
  );
};

const BookDetailView = ({ user, book, apiKey, onClose }: { user: any, book: any, apiKey: string, onClose: any }) => {
  const [activeTab, setActiveTab] = useState('note'); 
  const [noteHtml, setNoteHtml] = useState(book.noteHtml || '');
  const [rating, setRating] = useState(book.rating || 0);
  const [review, setReview] = useState(book.review || '');
  const [startDate, setStartDate] = useState(book.startDate || '');
  const [endDate, setEndDate] = useState(book.endDate || '');
  const [isSavedMsg, setIsSavedMsg] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    if(!user || !book) return;
    try {
      const currentHtml = editorRef.current ? editorRef.current.innerHTML : noteHtml;
      const bookRef = doc(db, 'users', user.uid, 'books', book.id);
      await setDoc(bookRef, {
        noteHtml: currentHtml, rating, review, startDate, endDate
      }, { merge: true });
      
      setNoteHtml(currentHtml);
      setIsSavedMsg(true);
      setTimeout(() => { setIsSavedMsg(false); onClose(); }, 800);
    } catch(e) {
      console.error(e);
      alert("기록 저장 중 문제가 발생했습니다.");
    }
  };

  const handleDelete = async () => {
    if(window.confirm("이 책의 모든 기록을 삭제할까요?")) {
      await deleteDoc(doc(db, 'users', user.uid, 'books', book.id));
      onClose();
    }
  };

  const handleRestart = async () => {
    if(!user || !book) return;
    await setDoc(doc(db, 'users', user.uid, 'books', book.id), { status: 'reading', endDate: '' }, { merge: true });
    onClose();
  };

  if (!book) return null;

  // 독서 노트에서 형광펜 문장 추출
  const getHighlightSnippet = () => {
    if (!noteHtml) return null;
    const match = noteHtml.match(/background-color:\s*(?:#FEF08A|yellow|#fef08a)[^>]*>([^<]+)</i) || noteHtml.match(/<mark[^>]*>([^<]+)<\/mark>/i);
    return match ? match[1] : null;
  };
  const highlightSnippet = getHighlightSnippet();

  return (
    <div className="animate-in fade-in flex flex-col h-[calc(100vh-130px)] max-w-xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-black text-lg truncate flex-1 pr-2">{book.title}</h2>
        <button onClick={handleSave} className="bg-[#FDE047] sketch-border px-4 py-2 text-xs font-black shadow-[2px_2px_0px_#451A03] hover:bg-[#FCD34D] flex items-center gap-1 cursor-pointer">
          {isSavedMsg ? "저장 완료! ✔️" : <><Save className="w-3.5 h-3.5"/> 기록 저장</>}
        </button>
      </div>

      <div className="flex mb-4 gap-1 overflow-x-auto hide-scrollbar pb-1">
        <TabBtn active={activeTab==='note'} onClick={()=>setActiveTab('note')} label="독서 노트" />
        <TabBtn active={activeTab==='info'} onClick={()=>setActiveTab('info')} label="책 정보" />
        <TabBtn active={activeTab==='guestbook'} onClick={()=>setActiveTab('guestbook')} label="방명록" />
        <TabBtn active={activeTab==='aiChat'} onClick={()=>setActiveTab('aiChat')} label="AI 독서모임" />
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {activeTab === 'info' && (
          <div className="bg-white p-5 sketch-border space-y-5">
            <div>
              <label className="block text-xs font-bold mb-1.5">별점</label>
              <div className="flex gap-1 items-center">
                {[0,1,2,3,4].map(idx => (
                  <span key={idx} onClick={(e: any) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setRating(idx + ((e.clientX - rect.left) < (rect.width/2) ? 0.5 : 1));
                  }} className="text-2xl cursor-pointer select-none text-stone-200 relative">
                    ★
                    <span className="absolute left-0 top-0 overflow-hidden text-[#FDE047]" style={{ width: rating >= idx + 1 ? '100%' : rating === idx + 0.5 ? '50%' : '0%' }}>★</span>
                  </span>
                ))}
                <span className="ml-2 text-xs font-bold">{rating.toFixed(1)}점</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">한줄평</label>
              <input type="text" inputMode="text" spellCheck="false" value={review} onChange={e=>setReview(e.target.value)} placeholder="이 책을 한 줄로 표현해 보세요" className="w-full p-3 bg-white sketch-border text-sm" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-bold mb-1.5">읽기 시작한 날</label>
                <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="w-full p-2 bg-white sketch-border text-xs" />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-bold mb-1.5">다 읽은 날</label>
                <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} disabled={book.status==='reading'} className="w-full p-2 bg-white sketch-border text-xs disabled:opacity-50" />
              </div>
            </div>
            
            <div className="pt-4 border-t-2 border-dashed border-[#451A03]/10 space-y-2">
              {book.status === 'abandoned' && (
                <button onClick={handleRestart} className="w-full py-3 bg-stone-100 sketch-border text-xs font-bold hover:bg-stone-200 cursor-pointer">📖 다시 읽기 (내 책상으로)</button>
              )}
              <button onClick={handleDelete} className="w-full py-3 bg-red-50 text-red-600 sketch-border text-xs font-bold hover:bg-red-100 cursor-pointer">🗑️ 이 기록 삭제하기</button>
            </div>
          </div>
        )}

        {activeTab === 'note' && <NoteEditor apiKey={apiKey} initialHtml={noteHtml} editorRef={editorRef} />}

        {/* 영수증 스타일 방명록 (컬러 표지 및 형광펜 문구 연동) */}
        {activeTab === 'guestbook' && (
          <div className="p-4">
            <div className="receipt-paper p-6 mx-auto max-w-sm flex flex-col items-center">
               <h3 className="font-bold text-xl mb-4 border-b-2 border-dashed border-gray-400 pb-2 w-full text-center">RECEIPT</h3>
               {book.thumbnail ? <img src={book.thumbnail} className="w-20 h-28 object-cover shadow-sm mb-4" alt="cover"/> : <BookOpen className="w-12 h-12 text-gray-300 mb-4"/>}
               <h4 className="font-bold text-base mb-1 text-center w-full truncate">{book.title}</h4>
               <p className="text-xs text-gray-500 mb-4 text-center">{book.authors}</p>
               
               <div className="w-full border-t-2 border-dashed border-gray-300 my-4"></div>
               
               <div className="flex justify-between w-full text-sm font-bold mb-2">
                 <span>RATING</span>
                 <span>{'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}</span>
               </div>
               
               <div className="w-full text-left mt-2">
                 <span className="text-xs text-gray-500 block mb-1">REVIEW</span>
                 <p className="text-sm italic break-keep bg-gray-50 p-2 border border-gray-200">"{review || '기록된 한줄평이 없습니다.'}"</p>
               </div>

               {highlightSnippet && (
                 <div className="w-full text-left mt-4">
                   <span className="text-xs text-amber-600 block mb-1 font-bold">✨ FAVORITE LINE</span>
                   <p className="text-xs bg-amber-50 p-2 border border-amber-200 italic">"{highlightSnippet}"</p>
                 </div>
               )}
               
               <div className="w-full border-t-2 border-dashed border-gray-300 my-4"></div>
               
               <div className="text-center w-full">
                 <p className="text-xs text-gray-400">THANK YOU FOR READING</p>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'aiChat' && <AIChatView apiKey={apiKey} book={book} noteHtml={noteHtml} review={review} />}
      </div>
    </div>
  );
};

const AIChatView = ({ apiKey, book, noteHtml, review }: { apiKey: string, book: any, noteHtml: string, review: string }) => {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([{
    role: 'model',
    content: `안녕하세요! "${book.title}"에 대한 독서 모임을 시작해볼까요? 남겨주신 노트와 한줄평을 바탕으로 자유롭게 감상을 나눠주세요.`
  }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || !apiKey) return;
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const cleanNote = noteHtml.replace(/<[^>]*>?/gm, '');
    const contextPrompt = `너는 나와 "${book.title}"(저자: ${book.authors})라는 책으로 독서 모임을 진행하는 다정한 파트너야. 내가 남긴 독서 노트 내용: "${cleanNote}", 내 한줄평: "${review}". 이 정보와 나의 다음 대답을 바탕으로 1~2문장으로 짧고 친근하게 대화를 이어가줘. 다음은 내 대답이야: ${input}`;

    const res = await callGeminiAPI(contextPrompt, apiKey, null, messages.slice(1)); 
    if (res) {
      setMessages(prev => [...prev, { role: 'model', content: res }]);
    } else {
      setMessages(prev => [...prev, { role: 'model', content: '앗, API 키 설정이나 네트워크를 다시 확인해 주세요.' }]);
    }
    setIsTyping(false);
  };

  return (
    <div className="flex flex-col h-full bg-stone-50 sketch-border p-4">
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 text-sm hide-scrollbar">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-2xl ${msg.role === 'user' ? 'bg-[#FDE047] text-[#451A03] rounded-tr-sm' : 'bg-white text-[#451A03] rounded-tl-sm border border-[#451A03]/10 shadow-sm'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white p-3 rounded-2xl rounded-tl-sm border border-[#451A03]/10 flex gap-1">
              <span className="animate-bounce">.</span><span className="animate-bounce delay-100">.</span><span className="animate-bounce delay-200">.</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="flex gap-2">
        <input type="text" value={input} onChange={e=>setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} spellCheck="false" placeholder={apiKey ? "감상을 입력해주세요..." : "설정에서 API 키를 먼저 입력해주세요"} className="flex-1 p-3 bg-white sketch-border text-sm focus:outline-none" disabled={!apiKey || isTyping} />
        <button onClick={handleSend} disabled={!input.trim() || !apiKey || isTyping} className="bg-[#451A03] text-white p-3 sketch-border disabled:opacity-50 cursor-pointer">
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

const TabBtn = ({ active, onClick, label }: { active: boolean, onClick: any, label: string }) => (
  <button onClick={onClick} className={`flex-1 py-2.5 px-2 min-w-[75px] sketch-border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${active ? 'bg-[#451A03] text-[#FDFBF7]' : 'bg-white text-[#451A03]/60'}`}>
    {label}
  </button>
);

const RecordView = ({ books }: { books: any[] }) => {
  const finishedBooks = books.filter(book => book.status === 'finished');

  return (
    <div className="animate-in fade-in pb-10">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-[#FDE047]"/> 독서 기록 및 통계</h2>
      
      <div className="bg-white p-5 sketch-border mb-6 shadow-[3px_3px_0px_rgba(69,26,3,0.05)]">
        <p className="text-xs font-bold text-[#451A03]/60">총 완독한 책</p>
        <p className="text-2xl font-black text-[#451A03] mt-1">{finishedBooks.length} 권</p>
      </div>

      {finishedBooks.length === 0 ? (
        <div className="text-center text-[#451A03]/60 flex flex-col items-center p-8 bg-white/50 sketch-border border-dashed rounded-3xl">
          <Calendar className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-bold text-sm">완독한 책 기록이 아직 없어요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {finishedBooks.map((book) => (
            <div key={book.id} className="bg-white p-4 rounded-xl sketch-border flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-gray-800">{book.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{book.authors} | 완독일: {book.endDate || '미입력'}</p>
              </div>
              <span className="text-xs bg-[#FDE047]/30 text-[#451A03] px-2.5 py-1 rounded-lg font-bold border border-[#451A03]/10">완료</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const NoteEditor = ({ apiKey, initialHtml, editorRef }: { apiKey: string, initialHtml: string, editorRef: any }) => {
  const fileInputRef = useRef<any>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);

  useEffect(() => { 
    if (editorRef.current && initialHtml && editorRef.current.innerHTML === '') {
      editorRef.current.innerHTML = initialHtml; 
    }
  }, [initialHtml, editorRef]);
  
  const execCmd = (cmd: string, val: any = null) => { document.execCommand(cmd, false, val); editorRef.current?.focus(); };

  const handleOcr = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!apiKey) return alert("설정에서 Gemini API 키를 입력해주세요!");
    setIsOcrLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const text = await callGeminiAPI("이미지에서 책 본문 텍스트만 정확히 추출해줘.", apiKey, reader.result as string);
      if (text && editorRef.current) {
        editorRef.current.innerHTML += `<br><blockquote style="border-left: 3px solid #FDE047; padding-left: 10px; font-style: italic;">${text.replace(/\n/g, '<br>')}</blockquote><br>`;
      }
      setIsOcrLoading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col h-full bg-white sketch-border overflow-hidden relative shadow-[2px_2px_0px_rgba(69,26,3,0.05)]">
      <div className="bg-stone-50 border-b-2 border-[#451A03]/10 p-2 flex gap-2 items-center">
        <button onClick={()=>execCmd('bold')} className="p-1.5 bg-white sketch-border text-xs font-bold cursor-pointer">B</button>
        <button onClick={()=>execCmd('hiliteColor', '#FEF08A')} className="p-1.5 bg-[#FEF08A] sketch-border text-xs font-bold cursor-pointer">형광펜</button>
        <div className="flex-1"></div>
        <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleOcr} />
        <button onClick={()=>fileInputRef.current?.click()} className="p-1.5 flex items-center gap-1 bg-stone-100 sketch-border text-[10px] font-bold cursor-pointer">
          <Camera className="w-3.5 h-3.5"/> 사진 밑줄
        </button>
      </div>
      <div ref={editorRef} contentEditable spellCheck="false" className="flex-1 p-4 bg-white overflow-y-auto text-sm focus:outline-none leading-relaxed" {...{ 'data-placeholder': '노트를 작성해보세요...' } as any} />
      {isOcrLoading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="animate-spin text-[#FDE047] w-6 h-6"/></div>}
    </div>
  );
};

const SettingsView = ({ apiKey, kakaoApiKey, saveKeysToDb }: { apiKey: string, kakaoApiKey: string, saveKeysToDb: any }) => {
  const [gKey, setGKey] = useState(apiKey);
  const [kKey, setKKey] = useState(kakaoApiKey);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveKeysToDb(gKey, kKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="animate-in fade-in space-y-5 pb-10 max-w-sm mx-auto">
      <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><Settings className="w-5 h-5 text-[#FDE047]"/> 설정</h2>
      
      <div className="bg-white p-5 sketch-border space-y-4">
        <div>
          <label className="block text-xs font-bold mb-1.5">카카오 도서 검색 API 키</label>
          <input type="text" spellCheck="false" value={kKey} onChange={e=>setKKey(e.target.value)} className="w-full p-3 bg-white sketch-border text-xs font-mono" placeholder="REST API 키" />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1.5">Gemini AI API 키 (AI 독서모임/OCR용)</label>
          <input type="password" value={gKey} onChange={e=>setGKey(e.target.value)} className="w-full p-3 bg-white sketch-border text-xs font-mono" />
        </div>
        <button onClick={handleSave} className="w-full bg-[#451A03] text-[#FDFBF7] py-3.5 sketch-border font-bold shadow-[2px_2px_0px_#FDE047] active:translate-y-0.5 transition-all mt-2 cursor-pointer">
          {saved ? '✔️ 기기 & 서버에 저장 완료' : '키 저장하기'}
        </button>
      </div>
      <p className="text-center text-[10px] text-[#451A03]/40 font-bold">지산의 서재 v1.0<br/>모든 데이터는 Firebase에 안전하게 보관됩니다.</p>
    </div>
  );
};
