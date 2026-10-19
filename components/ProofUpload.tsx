'use client';
// components/ProofUpload.tsx
// ============================================================
// THE LIFE-RPG PROTOCOL — Proof-of-Work Submission
//
// Flow:
//   1. User captures/selects an image
//   2. Preview shown
//   3. Upload to the PRIVATE 'submissions' bucket as {userId}/{uuid}.{ext}
//   4. Call the database function submit_quest_proof with that path
//      (status becomes pending_verification)
//   5. Emit onSubmitted callback with the created UserQuest
//
// Images are never shown through a public URL: jurors and owners get
// short-lived signed links from /api/proofs/:id.
// ============================================================

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { supabase, startQuest, submitQuestProof } from '@/lib/supabase';
import type { UserQuest } from '@/types/rpg';

// ── TYPES ─────────────────────────────────────────────────────
type UploadState = 'idle' | 'preview' | 'uploading' | 'submitted' | 'error';

interface ProofUploadProps {
  userId:     string;
  questId:    string;
  questTitle?: string;
  onSubmitted?: (quest: UserQuest) => void;
}

// ── HELPERS ───────────────────────────────────────────────────
// The extension comes from the (checked) file type, never from the file
// name, because the storage policy only accepts these image extensions.
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

function generateStoragePath(userId: string, file: File): string {
  return `${userId}/${crypto.randomUUID()}.${EXTENSION_BY_TYPE[file.type]}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_MB    = 5;    // same limit as the storage bucket

// ── COMPONENT ─────────────────────────────────────────────────
export default function ProofUpload({
  userId,
  questId,
  questTitle = 'Quest',
  onSubmitted,
}: ProofUploadProps) {
  const { isClassic } = useTheme();

  const [uploadState,  setUploadState]  = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null);
  const [progress,     setProgress]     = useState(0);     // 0–100
  const [errorMsg,     setErrorMsg]     = useState('');
  const [submittedQuest, setSubmittedQuest] = useState<UserQuest | null>(null);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── FILE SELECTION ─────────────────────────────────────────
  const handleFile = useCallback((file: File | null | undefined) => {
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrorMsg('Please upload a JPG, PNG, WebP, or GIF image.');
      setUploadState('error');
      return;
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setErrorMsg(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
      setUploadState('error');
      return;
    }

    // Revoke previous object URL to avoid memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMsg('');
    setUploadState('preview');
  }, [previewUrl]);

  // ── UPLOAD & SUBMIT ────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!selectedFile) return;

    setUploadState('uploading');
    setProgress(0);

    try {
      // 1. Upload to Supabase Storage
      const storagePath = generateStoragePath(userId, selectedFile);

      // Simulate granular progress (Supabase JS SDK doesn't expose upload progress natively)
      // We simulate it in stages: 0→40 (uploading), 40→80 (processing), 80→100 (writing record)
      const progressTick = setInterval(() => {
        setProgress(p => {
          if (p >= 75) { clearInterval(progressTick); return p; }
          return p + 5 + Math.random() * 5;
        });
      }, 120);

      const { data: storageData, error: storageError } = await supabase.storage
        .from('submissions')
        .upload(storagePath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        });

      clearInterval(progressTick);

      if (storageError) throw new Error(`Storage error: ${storageError.message}`);

      setProgress(80);

      // 2. Start (or resume) the quest, then hand in the proof file's path.
      //    The database checks that you own the quest and the file.
      const userQuestId = await startQuest(questId);
      if (!userQuestId) throw new Error('Failed to start quest. Please try again.');

      const submitted = await submitQuestProof(userQuestId, storageData.path);
      if (!submitted) throw new Error('Failed to save quest record. Please try again.');

      const userQuest: UserQuest = {
        id: userQuestId,
        user_id: userId,
        quest_id: questId,
        status: 'pending_verification',
        proof_url: storageData.path,
        started_at: new Date().toISOString(),
        completed_at: null,
        aura_penalty: 0,
        jury_verdict: null,
        created_at: new Date().toISOString(),
      };

      setProgress(100);
      setSubmittedQuest(userQuest);
      setUploadState('submitted');
      onSubmitted?.(userQuest);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setErrorMsg(message);
      setUploadState('error');
    }
  }, [selectedFile, userId, questId, onSubmitted]);

  // ── RESET ──────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setProgress(0);
    setErrorMsg('');
    setUploadState('idle');
    setSubmittedQuest(null);
  }, [previewUrl]);

  // ── SHARED STYLES ──────────────────────────────────────────
  const accentStyle = {
    color: 'var(--accent)',
    ...(isClassic ? { textShadow: '0 0 8px var(--accent-glow)' } : {}),
  };

  return (
    <div className="proof-upload flex flex-col gap-4 w-full max-w-md mx-auto">

      {/* Hidden file inputs */}
      <input ref={fileInputRef}   type="file" accept={ACCEPTED_TYPES.join(',')}
        className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={e => handleFile(e.target.files?.[0])} />

      <AnimatePresence mode="wait">

        {/* ── IDLE: select or capture ─────────────────────── */}
        {(uploadState === 'idle' || uploadState === 'error') && (
          <motion.div
            key="idle"
            className="flex flex-col items-center gap-5 text-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {/* Drop zone */}
            <motion.div
              className="w-full rounded-2xl border-2 border-dashed p-8 flex flex-col items-center gap-3 cursor-pointer transition-all"
              style={{ borderColor: 'var(--border-accent)', background: 'var(--accent-soft)' }}
              whileHover={{ scale: 1.01 }}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="text-4xl">📸</span>
              <p className="font-bold text-sm" style={accentStyle}>
                Drop proof image here
              </p>
              <p className="text-xs opacity-40" style={{ color: 'var(--text-secondary)' }}>
                JPG / PNG / WebP · Max {MAX_SIZE_MB} MB
              </p>
            </motion.div>

            {/* Buttons row */}
            <div className="flex gap-3 w-full">
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-bold uppercase tracking-widest border transition-all hover:opacity-80"
                style={{ borderColor: 'var(--border-accent)', color: 'var(--accent)' }}
                onClick={() => fileInputRef.current?.click()}
              >
                📁 Upload File
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-bold uppercase tracking-widest border transition-all hover:opacity-80"
                style={{ borderColor: 'var(--border-accent)', color: 'var(--accent)' }}
                onClick={() => cameraInputRef.current?.click()}
              >
                📷 Camera
              </button>
            </div>

            {/* Error */}
            {uploadState === 'error' && (
              <motion.p
                className="text-sm font-semibold text-center"
                style={{ color: '#ff3355' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              >
                ⚠ {errorMsg}
              </motion.p>
            )}
          </motion.div>
        )}

        {/* ── PREVIEW: review before submitting ──────────── */}
        {uploadState === 'preview' && selectedFile && previewUrl && (
          <motion.div
            key="preview"
            className="flex flex-col gap-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {/* Image preview */}
            <div className="relative rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border-accent)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Proof preview"
                className="w-full max-h-64 object-cover"
              />
              <div
                className="absolute bottom-0 left-0 right-0 px-3 py-2 text-xs font-mono"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
              >
                {selectedFile.name} · {formatBytes(selectedFile.size)}
              </div>
              {/* Change image */}
              <button
                className="absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-bold"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}
                onClick={() => fileInputRef.current?.click()}
              >
                Change
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={reset}
                className="px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-widest border transition-all hover:opacity-70"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <motion.button
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all"
                style={{
                  background: 'var(--accent)',
                  color: '#000',
                  boxShadow: isClassic ? '0 0 16px var(--accent-glow)44' : 'none',
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Submit Proof ⚔
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── UPLOADING: progress bar ─────────────────────── */}
        {uploadState === 'uploading' && (
          <motion.div
            key="uploading"
            className="flex flex-col items-center gap-5 py-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-3xl">⏫</div>
            <div className="w-full space-y-2">
              <div className="flex justify-between text-xs font-mono opacity-50"
                style={{ color: 'var(--text-secondary)' }}>
                <span>Uploading proof...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--xp-track)' }}>
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: 'var(--xp-fill)', boxShadow: isClassic ? '0 0 8px var(--accent-glow)' : 'none' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
            <p className="text-xs opacity-40" style={{ color: 'var(--text-secondary)' }}>
              {progress < 80 ? 'Uploading to secure storage...' : 'Recording quest attempt...'}
            </p>
          </motion.div>
        )}

        {/* ── SUBMITTED: success ──────────────────────────── */}
        {uploadState === 'submitted' && (
          <motion.div
            key="submitted"
            className="flex flex-col items-center gap-5 text-center py-4"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 240 }}
          >
            <motion.div
              className="text-5xl"
              animate={{ scale: [1, 1.25, 1] }}
              transition={{ duration: 0.5 }}
            >
              🏆
            </motion.div>
            <div>
              <p className="font-black text-xl display-font" style={{ color: '#69ff96', textShadow: isClassic ? '0 0 12px #69ff9666' : 'none' }}>
                Proof Submitted!
              </p>
              <p className="text-sm opacity-60 mt-1" style={{ color: 'var(--text-secondary)' }}>
                Your quest is pending verification
              </p>
            </div>
            <div
              className="w-full rounded-xl px-4 py-3 border text-left space-y-1"
              style={{ borderColor: '#69ff9633', background: 'rgba(105,255,150,0.05)' }}
            >
              <p className="text-xs font-mono opacity-50" style={{ color: 'var(--text-secondary)' }}>
                Quest ID: {submittedQuest?.id?.slice(0, 8)}...
              </p>
              <p className="text-xs font-mono opacity-50" style={{ color: 'var(--text-secondary)' }}>
                Status: <span style={{ color: '#ffd700' }}>PENDING VERIFICATION</span>
              </p>
              <p className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }}>
                XP will be awarded after review
              </p>
            </div>
            <button
              onClick={reset}
              className="px-6 py-2 rounded-xl text-sm font-bold uppercase tracking-widest border transition-all hover:opacity-70"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Submit Another
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
