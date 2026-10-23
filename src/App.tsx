import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { Plus, Settings, Search, BookOpen, Calendar, CheckCircle2, Loader2, Save, Library, ChevronLeft, Camera, BookKey } from 'lucide-react';

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

// --- Constants ---
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

// --- iOS 스타일 따뜻한 3D 북 로고 SVG ---
const BookStackLogo = () => (
  <svg viewBox="0 0 100 100" className="w-9 h-9 drop-shadow-sm" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(10, 50) rotate(-6)">
      <path d="M5,15 L75
