import React, { useState } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { Badge } from '../../../ui/Badge';
import { Alert } from '../../../ui/Alert';
import { CheckIcon, SparklesIcon, SettingsIcon, ShieldCheckIcon, HistoryIcon } from '../../../ui/Icons';

export interface WebsiteNavigationTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

export interface NavLinkItem {
  id: string;
  label: string;
  path: string;
  isExternal?: boolean;
}

export function WebsiteNavigationTab({
  settings,
  onSave,
  isLoading,
}: WebsiteNavigationTabProps) {
  const [navLinks, setNavLinks] = useState<NavLinkItem[]>([
    { id: '1', label: 'Services', path: '/services' },
    { id: '2', label: 'About', path: '/about' },
    { id: '3', label: 'Track Ride', path: '/track' },
    { id: '4', label: 'Contact', path: '/contact' },
    { id: '5', label: 'Passenger Portal', path: '/app' },
  ]);

  const [headerCtaLabel, setHeaderCtaLabel] = useState('Book Online');
  const [headerCtaPath, setHeaderCtaPath] = useState('/book');
  const [showPhoneBadge, setShowPhoneBadge] = useState(true);

  // Global Announcement Bar
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [announcementText, setAnnouncementText] = useState(
    'Winter Storm Alert: Advance reservations recommended. Drivers operating with standard snow protocol.'
  );
  const [announcementType, setAnnouncementType] = useState<'info' | 'warning' | 'alert'>('warning');

  // Footer Config
  const [footerCopyright, setFooterCopyright] = useState(
    `© ${new Date().getFullYear()} ${COMPANY_CONFIG.name}. All rights reserved.`
  );
  const [licensingText, setLicensingText] = useState(
    'Licensed Metropolitan Taxicab & Executive Livery Provider. STL Regional Permit #4029.'
  );
  const [facebookUrl, setFacebookUrl] = useState('https://facebook.com/chesterfieldtaxi');
  const [linkedinUrl, setLinkedinUrl] = useState('https://linkedin.com/company/chesterfield-taxi');

  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleAddLink = () => {
    const newId = String(Date.now());
    setNavLinks((prev) => [...prev, { id: newId, label: 'New Link', path: '/' }]);
  };

  const handleRemoveLink = (id: string) => {
    setNavLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const handleUpdateLink = (id: string, updates: Partial<NavLinkItem>) => {
    setNavLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  };

  const handleSaveAll = async () => {
    const existingCms = (settings as any).cms || {};
    await onSave({
      cms: {
        ...existingCms,
        navigation: {
          navLinks,
          headerCtaLabel,
          headerCtaPath,
          showPhoneBadge,
          announcement: {
            enabled: announcementEnabled,
            text: announcementText,
            type: announcementType,
          },
          footer: {
            copyright: footerCopyright,
            licensing: licensingText,
            socials: {
              facebook: facebookUrl,
              linkedin: linkedinUrl,
            },
          },
        },
      },
      updatedAt: new Date().toISOString(),
    } as any);

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
            Navigation Architecture
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
            Header Menu, Announcement Bar &amp; Footer Studio
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage public navigation links, emergency alert ribbons, and corporate compliance footers.
          </p>
        </div>

        <Button
          type="button"
          onClick={handleSaveAll}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-2"
        >
          <SparklesIcon className="w-4 h-4" />
          <span>{isLoading ? 'Saving...' : 'Save Navigation Settings'}</span>
        </Button>
      </div>

      {saveSuccess && (
        <Alert variant="success" className="animate-in fade-in text-xs font-semibold">
          Header, announcement, and footer settings successfully synchronized!
        </Alert>
      )}

      {/* 1. Top Announcement Bar Manager */}
      <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900">
                Site-Wide Announcement &amp; Advisory Ribbon
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Displays a prominent notice bar above the main navigation header on all public pages.
              </CardDescription>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={announcementEnabled}
                onChange={(e) => setAnnouncementEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
            </label>
          </div>
        </CardHeader>

        {announcementEnabled && (
          <CardContent className="p-6 space-y-4 animate-in fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-3">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Announcement Message Text
                </label>
                <Input
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Alert Level</label>
                <select
                  value={announcementType}
                  onChange={(e) => setAnnouncementType(e.target.value as any)}
                  className="w-full text-xs font-bold px-3 py-2 bg-white border border-slate-200 rounded-lg"
                >
                  <option value="info">Info (Blue Notice)</option>
                  <option value="warning">Weather Warning (Amber)</option>
                  <option value="alert">Critical Alert (Red)</option>
                </select>
              </div>
            </div>

            {/* Live Preview */}
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                announcementType === 'warning'
                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                  : announcementType === 'alert'
                  ? 'bg-rose-600 text-white border-rose-700'
                  : 'bg-blue-600 text-white border-blue-700'
              }`}
            >
              <span>📢 {announcementText}</span>
              <span className="text-[10px] opacity-80 uppercase tracking-wider font-mono">Live Preview</span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* 2. Header Navigation Links */}
      <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-extrabold text-slate-900">
              Header Navigation Links &amp; CTAs
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Configure the items displayed in the desktop and mobile navigation menus.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddLink}
            className="text-xs font-bold"
          >
            + Add Link
          </Button>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            {navLinks.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl"
              >
                <span className="text-xs font-mono font-bold text-slate-400 w-5">
                  #{index + 1}
                </span>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    value={item.label}
                    onChange={(e) => handleUpdateLink(item.id, { label: e.target.value })}
                    placeholder="Link Label (e.g. Services)"
                    className="text-xs font-bold"
                  />
                  <Input
                    value={item.path}
                    onChange={(e) => handleUpdateLink(item.id, { path: e.target.value })}
                    placeholder="Target Path (e.g. /services)"
                    className="text-xs font-mono"
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveLink(item.id)}
                  className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Header Action Button Label
              </label>
              <Input
                value={headerCtaLabel}
                onChange={(e) => setHeaderCtaLabel(e.target.value)}
                className="text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Header Action Button Target
              </label>
              <Input
                value={headerCtaPath}
                onChange={(e) => setHeaderCtaPath(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
            <div className="flex flex-col justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-800">Phone Badge in Header</span>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showPhoneBadge}
                  onChange={(e) => setShowPhoneBadge(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                />
                <span className="text-xs text-slate-600 font-medium">Show {COMPANY_CONFIG.phone.dispatch}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Footer & Legal Compliance */}
      <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
          <CardTitle className="text-base font-extrabold text-slate-900">
            Footer Copyright &amp; Social Profile Links
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Global bottom footer text, regulatory municipal licenses, and social media channels.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Footer Copyright Text
              </label>
              <Input
                value={footerCopyright}
                onChange={(e) => setFooterCopyright(e.target.value)}
                className="text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Regulatory Licensing Line
              </label>
              <Input
                value={licensingText}
                onChange={(e) => setLicensingText(e.target.value)}
                className="text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Facebook Profile URL
              </label>
              <Input
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                LinkedIn Company URL
              </label>
              <Input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
