import type {Metadata,Viewport} from 'next';
import './globals.css';
export const metadata:Metadata={title:'WOD Crew — Train apart. Progress together.',description:'Your shared workout board, precision timer, and crew scorebook. Build a WOD. Start on your time. Keep each other going.',appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'WOD Crew'},icons:{icon:'/favicon.svg'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#111411'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
