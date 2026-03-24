'use client';

import React, { useState, useEffect } from 'react';
import { Camera, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function DailyDiscoveryPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasDiscoveredToday, setHasDiscoveredToday] = useState(false);
  const [result, setResult] = useState<{ summary: string; luck: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Check rate limit on load
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('daily_discoveries')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startOfDay.toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setHasDiscoveredToday(true);
        setResult({
          summary: data[0].analysis_summary,
          luck: data[0].luck_granted
        });
        setImagePreview(data[0].image_url);
      }
    }

    init();
  }, []);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleUpload = async () => {
    if (!imageFile || !userId) return;

    setIsUploading(true);
    setErrorMsg('');

    try {
      // 1. Upload to storage (assuming public bucket named 'discoveries' exists, or using a mock URL)
      // Since setting up a bucket might be out of scope, we will use a data URL or mock URL for the prototype.
      // We'll mock the URL upload for now to keep the demo isolated.
      const mockImageUrl = 'uploaded_image_mock_' + Date.now();

      // 2. Call our API 
      const res = await fetch('/api/discovery/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageUrl: mockImageUrl
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze discovery');
      }

      setHasDiscoveredToday(true);
      setResult({
        summary: data.data.analysis_summary,
        luck: data.data.luck_granted
      });

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="dashboard-bg">
      <div className="max-w-3xl mx-auto p-6">
        
        <header className="mb-8">
          <h1 className="text-3xl font-bold display-font text-white flex items-center gap-3">
            <Camera className="text-[#06B6D4]" />
            Daily Discovery
          </h1>
          <p className="text-[#CBD5E1] mt-2 text-sm leading-relaxed max-w-xl">
            Document your offline routine. AI analysis of your balanced habits grants a temporary <strong className="text-[#F4C430]">Luck Boost</strong> for your next focus session. Limit one upload per day.
          </p>
        </header>

        <section className="character-sheet p-8 rounded-2xl relative overflow-hidden">
          {hasDiscoveredToday && result ? (
            <div className="flex flex-col items-center justify-center text-center py-8">
              <CheckCircle2 size={64} className="text-[#06B6D4] mb-4 drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
              <h2 className="text-2xl font-bold text-white mb-2">Discovery Complete</h2>
              <p className="text-[#CBD5E1] mb-6 italic max-w-md">"{result.summary}"</p>
              
              <div className="bg-[#131B2F] border border-white/10 px-6 py-4 rounded-xl inline-flex items-center gap-4">
                <Sparkles className="text-[#F4C430]" />
                <div className="text-left">
                  <div className="text-sm text-[#CBD5E1]">Temporary Bonus</div>
                  <div className="text-xl font-bold text-[#F4C430]">+{result.luck} Luck</div>
                </div>
              </div>

              <div className="mt-8 text-xs text-[#CBD5E1]/50 tracking-wider uppercase flex items-center gap-2">
                <AlertCircle size={14} /> Reset occurs at midnight UTC
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              
              <label className={`w-full max-w-md aspect-video rounded-xl border-2 border-dashed ${imagePreview ? 'border-[#06B6D4]/50' : 'border-white/20'} flex flex-col items-center justify-center bg-[#131B2F]/50 cursor-pointer hover:bg-[#131B2F]/80 transition-colors overflow-hidden group`}>
                <input type="file" className="hidden" accept="image/*" onChange={handleImagePick} />
                
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <div className="p-6 text-center text-[#CBD5E1]">
                    <Camera size={32} className="mx-auto mb-3 opacity-50" />
                    <span className="text-sm font-medium block">Click to upload photo</span>
                    <span className="text-xs opacity-50 mt-1 block">PNG, JPG up to 5MB</span>
                  </div>
                )}
              </label>

              {errorMsg && (
                <div className="mt-6 text-[#EC4899] bg-[#EC4899]/10 px-4 py-2 rounded-lg text-sm border border-[#EC4899]/20 flex items-center gap-2">
                  <AlertCircle size={16} /> {errorMsg}
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!imageFile || isUploading}
                className={`mt-8 px-8 py-3 rounded-full font-bold text-sm tracking-wide transition-all
                  ${!imageFile || isUploading
                    ? 'bg-[#131B2F] text-white/30 cursor-not-allowed border border-white/10'
                    : 'bg-[#06B6D4] text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]'
                  }`}
              >
                {isUploading ? 'Analyzing Image...' : 'Submit Discovery'}
              </button>
            </div>
          )}
        </section>
        
      </div>
    </div>
  );
}
