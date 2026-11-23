'use client';
import {useEffect} from 'react';
import {Check,X} from 'lucide-react';
export default function Notice({message,onClose}:{message:string;onClose:()=>void}){
 useEffect(()=>{const timer=setTimeout(onClose,6000);return()=>clearTimeout(timer);},[message,onClose]);
 return <div className="toast" role="status"><Check size={17}/><span>{message}</span><button type="button" className="icon-btn" aria-label="Dismiss notification" onClick={onClose}><X size={20}/></button></div>;
}
