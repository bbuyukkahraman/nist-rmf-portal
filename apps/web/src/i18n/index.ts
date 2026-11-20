import React from 'react';
import { useEffect } from 'react';
export type Lang = 'en' | 'tr';

const dict: Record<Lang, Record<string, string>> = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.systems': 'Systems',
    'nav.audit': 'Audit',
    'nav.notifications': 'Notifications',
    'nav.security': 'Security',
    'nav.logout': 'Logout',
    'login.title': 'Login',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Login',
    'login.register': 'Register tenant',
    'dashboard.title': 'Dashboard',
    'dashboard.systems': 'Systems',
    'dashboard.controls': 'Controls',
    'dashboard.users': 'Users',
    'dashboard.poamOpen': 'Open POA&M',
    'dashboard.poamOverdue': 'Overdue POA&M',
    'dashboard.authExpiring': 'Auth expiring (30d)',
    'dashboard.audit7d': 'Audit (7d)',
    'dashboard.unread': 'Unread notifications',
  },
  tr: {
    'nav.dashboard': 'Gösterge Paneli',
    'nav.systems': 'Sistemler',
    'nav.audit': 'Denetim İzi',
    'nav.notifications': 'Bildirimler',
    'nav.security': 'Güvenlik',
    'nav.logout': 'Çıkış',
    'login.title': 'Giriş',
    'login.email': 'E-posta',
    'login.password': 'Şifre',
    'login.submit': 'Giriş Yap',
    'login.register': 'Tenant kaydı',
    'dashboard.title': 'Gösterge Paneli',
    'dashboard.systems': 'Sistemler',
    'dashboard.controls': 'Kontroller',
    'dashboard.users': 'Kullanıcılar',
    'dashboard.poamOpen': 'Açık POA&M',
    'dashboard.poamOverdue': 'Gecikmiş POA&M',
    'dashboard.authExpiring': 'Süresi dolacak yetki (30g)',
    'dashboard.audit7d': 'Denetim (7g)',
    'dashboard.unread': 'Okunmamış bildirim',
  },
};

let current: Lang = (localStorage.getItem('lang') as Lang) || 'en';
const listeners = new Set<() => void>();

export function getLang(): Lang { return current; }
export function setLang(l: Lang) { current = l; localStorage.setItem('lang', l); listeners.forEach(fn => fn()); }
export function t(key: string): string { return dict[current][key] || key; }
export function useT() {
  const [, force] = React.useState(0);
  useEffect(() => {
    const fn = () => force(x => x + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return t;
}
