import { useEffect } from 'react';

interface AdBannerProps {
  slot: string;
  showLabels: boolean;
}

export function AdBanner({ slot, showLabels }: AdBannerProps) {
  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // Ads might be blocked by browser
    }
  }, []);

  if (!showLabels) return null;

  return (
    <div className="flex-1 flex flex-col p-4 border-t border-black/5 overflow-hidden min-h-[100px]">
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-2 text-center shrink-0">Publicidade</p>
      <div className="flex-1 bg-black/[0.02] rounded-[24px] flex items-center justify-center relative min-h-[80px]">
        {/* 
            IMPORTANT: Replace ca-pub-XXXXXXXXXXXXXXXX with your actual Publisher ID 
            and your-ad-slot-id with your actual Ad Slot ID.
        */}
        <ins className="adsbygoogle"
             style={{ display: 'block', width: '100%', height: '100%' }}
             data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
             data-ad-slot={slot}
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
      </div>
    </div>
  );
}

export default AdBanner;
