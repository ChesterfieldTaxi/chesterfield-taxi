import React, { useState } from 'react';
import type { BrandingConfig } from '../../../../core/types/config';
import { Button } from '../../../ui/Button';
import { AlertTriangleIcon, CarIcon } from '../../../ui/Icons';

export interface BrandLivePreviewCanvasProps {
  draftBranding: BrandingConfig;
  companyName: string;
  companyPhone: string;
  hasUnpublishedChanges: boolean;
  isSaving: boolean;
  onDiscardDraft: () => void;
  onPublishBranding: () => void;
}

export function BrandLivePreviewCanvas({
  draftBranding,
  companyName,
  companyPhone,
  hasUnpublishedChanges,
  isSaving,
  onDiscardDraft,
  onPublishBranding,
}: BrandLivePreviewCanvasProps) {
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  const canvasStyles: React.CSSProperties = {
    '--color-primary': draftBranding.primaryColor || '#2563eb',
    '--color-secondary': draftBranding.secondaryColor || '#0f172a',
    '--brand-primary': draftBranding.primaryColor || '#2563eb',
    '--brand-secondary': draftBranding.secondaryColor || '#0f172a',
    '--font-heading': `'${draftBranding.headingFont || 'Inter'}', sans-serif`,
    '--font-body': `'${draftBranding.bodyFont || 'Inter'}', sans-serif`,
    '--color-heading': draftBranding.headingColor || '#0f172a',
    '--color-text-main': draftBranding.bodyTextColor || '#334155',
    '--color-text-muted': draftBranding.mutedTextColor || '#64748b',
    '--btn-primary-bg': draftBranding.btnPrimaryBg || draftBranding.primaryColor || '#2563eb',
    '--btn-primary-text': draftBranding.btnPrimaryText || '#ffffff',
    '--btn-secondary-bg': draftBranding.btnSecondaryBg || draftBranding.secondaryColor || '#0f172a',
    '--btn-secondary-text': draftBranding.btnSecondaryText || '#ffffff',
    '--btn-radius': draftBranding.btnBorderRadius || '8px',
    '--navbar-bg': draftBranding.navbarBg || '#0f172a',
    '--card-bg': draftBranding.cardBg || '#ffffff',
  } as React.CSSProperties;

  return (
    <div className="space-y-3">
      {/* Browser Chrome Header + Device Switcher */}
      <div className="bg-slate-900 text-white px-3.5 sm:px-4 py-2.5 rounded-t-2xl flex flex-wrap items-center justify-between gap-2 text-xs shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <span className="text-slate-400 font-mono text-[11px] ml-1 truncate">
            Live Brand Preview Canvas
          </span>
        </div>

        <div className="bg-slate-800 p-0.5 rounded-lg flex items-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => setPreviewDevice('desktop')}
            className={`px-2.5 py-0.5 rounded font-bold transition-all cursor-pointer ${
              previewDevice === 'desktop' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setPreviewDevice('mobile')}
            className={`px-2.5 py-0.5 rounded font-bold transition-all cursor-pointer ${
              previewDevice === 'mobile' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mobile
          </button>
        </div>
      </div>

      {/* Scoped CSS Custom Properties Preview Container */}
      <div
        className={`mx-auto bg-slate-100 rounded-b-2xl border-x border-b border-slate-300 overflow-hidden shadow-lg transition-all ${
          previewDevice === 'mobile' ? 'max-w-sm' : 'w-full'
        }`}
        style={canvasStyles}
      >
        {/* Mock Navigation Bar */}
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-2 transition-colors"
          style={{ backgroundColor: 'var(--navbar-bg)', borderColor: 'rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 flex items-center justify-center shadow-sm shrink-0 overflow-hidden"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                borderRadius: 'var(--btn-radius)',
              }}
            >
              {draftBranding.logoUrl ? (
                <img
                  src={draftBranding.logoUrl}
                  alt={companyName}
                  className="w-6 h-6 object-contain"
                />
              ) : (
                <CarIcon className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3
                className="text-xs font-black tracking-tight leading-none text-white truncate"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {companyName || 'Chesterfield Taxi'}
              </h3>
              <span
                className="text-[9px] font-semibold tracking-wider uppercase leading-none"
                style={{ color: 'var(--btn-primary-bg)' }}
              >
                24/7 Car Service
              </span>
            </div>
          </div>

          <button
            type="button"
            className="px-3 py-1 text-[11px] font-bold shadow-2xs shrink-0"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              borderRadius: 'var(--btn-radius)',
            }}
          >
            Call {companyPhone || '(314) 738-0100'}
          </button>
        </div>

        {/* Mock Hero & Instant Rate Estimator Card */}
        <div className="p-5 space-y-4">
          <div className="text-center space-y-1">
            <h2
              className="text-lg font-black tracking-tight"
              style={{
                fontFamily: 'var(--font-heading)',
                color: 'var(--color-heading)',
              }}
            >
              Reliable Chesterfield &amp; Airport Transportation
            </h2>
            <p
              className="text-xs max-w-md mx-auto"
              style={{
                fontFamily: 'var(--font-body)',
                color: 'var(--color-text-main)',
              }}
            >
              Upfront flat-rate airport rides, live flight tracking, car safety seats, and corporate accounts.
            </p>
          </div>

          <div
            className="p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 transition-colors"
            style={{ backgroundColor: 'var(--card-bg)' }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span
                className="font-bold text-xs"
                style={{
                  fontFamily: 'var(--font-heading)',
                  color: 'var(--color-heading)',
                }}
              >
                Instant Rate Estimator
              </span>
              <span
                className="text-[10px] font-bold px-2 py-0.5"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                  borderRadius: 'var(--btn-radius)',
                }}
              >
                Guaranteed Upfront Fare
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 min-w-0">
                <span
                  className="text-[9px] uppercase font-bold block"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Pickup Location
                </span>
                <span
                  className="font-semibold truncate block"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  Chesterfield Valley
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 min-w-0">
                <span
                  className="text-[9px] uppercase font-bold block"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Dropoff Destination
                </span>
                <span
                  className="font-semibold truncate block"
                  style={{ color: 'var(--color-text-main)' }}
                >
                  St. Louis Lambert Airport (STL)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50/70 rounded-lg border border-slate-100">
              <div>
                <span
                  className="text-xs font-bold block"
                  style={{ color: 'var(--color-heading)' }}
                >
                  Estimated Total:
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  18.4 mi &bull; 24 min trip
                </span>
              </div>
              <div
                className="text-base font-extrabold font-mono"
                style={{ color: 'var(--color-heading)' }}
              >
                $45.00
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                className="w-full py-2 text-xs font-bold shadow-2xs transition-all"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                  borderRadius: 'var(--btn-radius)',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                Book Ride Now &rarr;
              </button>
              <button
                type="button"
                className="w-full py-2 text-xs font-bold shadow-2xs transition-all"
                style={{
                  backgroundColor: 'var(--btn-secondary-bg)',
                  color: 'var(--btn-secondary-text)',
                  borderRadius: 'var(--btn-radius)',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                Corporate Portal
              </button>
            </div>
          </div>

          {/* Active Draft Tokens Bar */}
          <div className="p-2.5 rounded-lg bg-slate-200/70 border border-slate-300/60 text-[10px] space-y-1">
            <div className="flex items-center justify-between text-slate-700 font-bold">
              <span>Active Draft Tokens</span>
              <span className="font-mono">Radius: {draftBranding.btnBorderRadius || '8px'}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 text-slate-600 font-mono">
              <div className="truncate">Heading: {draftBranding.headingFont || 'Inter'}</div>
              <div className="truncate">Body: {draftBranding.bodyFont || 'Inter'}</div>
              <div className="flex items-center gap-1">
                <span>Primary:</span>
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block border border-black/15"
                  style={{ backgroundColor: draftBranding.btnPrimaryBg || draftBranding.primaryColor }}
                />
                <span>{draftBranding.btnPrimaryBg || draftBranding.primaryColor}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>Secondary:</span>
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block border border-black/15"
                  style={{ backgroundColor: draftBranding.secondaryColor }}
                />
                <span>{draftBranding.secondaryColor}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unpublished Draft Banner */}
      {hasUnpublishedChanges && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-900 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Unpublished theme changes active in draft preview.</span>
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onDiscardDraft}
              className="px-2.5 py-1 text-slate-700 hover:text-red-700 font-bold text-[11px] cursor-pointer"
            >
              Discard
            </button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onPublishBranding}
              isLoading={isSaving}
            >
              Publish Site-Wide
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
