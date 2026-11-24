import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CANNED_SMS_TEMPLATES_CONFIG,
  normalizeCannedSmsTemplates,
  type AppSettings,
  type CannedSmsTemplateCategory,
  type CannedSmsTemplatesConfig,
} from '../../../../core/types/config';
import {
  getResolvedCannedSmsTemplates,
  interpolateCommsSmsTemplate,
} from '../../../../core/services/comms/comms-templates.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { ChatBubbleLeftRightIcon, PlusIcon, RefreshCwIcon, TrashIcon } from '../../../ui/Icons';

export interface CannedSmsTemplatesEditorCardProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  onNotifySuccess: (message: string) => void;
  isLoading?: boolean;
}

const VARIABLE_TOKENS = [
  '{passengerFirstName}',
  '{driverName}',
  '{carUnit}',
  '{pickupTime}',
  '{pickupShort}',
  '{trackingUrl}',
  '{pickupDoor}',
  '{payUrl}',
] as const;

const SAMPLE_PREVIEW_CONTEXT = {
  firstName: 'Jordan',
  driverName: 'Marcus',
  carUnit: '104',
  tripId: 'CT-4821',
  pickupTime: '6:15 AM',
  pickupShort: 'STL Lambert Terminal 2',
  dropoffShort: '400 Chesterfield Center',
  airlineCode: 'WN',
  airportCode: 'STL',
  trackingUrl: 'https://chesterfieldtaxi.com/track?ref=CT-4821',
  payUrl: 'https://chesterfieldtaxi.com/pay/tok_demo',
};

export function CannedSmsTemplatesEditorCard({
  settings,
  onSave,
  onNotifySuccess,
  isLoading = false,
}: CannedSmsTemplatesEditorCardProps) {
  const [isSavingSms, setIsSavingSms] = useState(false);
  const [smsConfig, setSmsConfig] = useState<CannedSmsTemplatesConfig>(() =>
    normalizeCannedSmsTemplates(settings.integrations?.cannedSmsTemplates)
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('driver_en_route');

  useEffect(() => {
    setSmsConfig(normalizeCannedSmsTemplates(settings.integrations?.cannedSmsTemplates));
  }, [settings.integrations?.cannedSmsTemplates]);

  const resolvedTemplates = useMemo(
    () =>
      getResolvedCannedSmsTemplates(
        { ...settings, integrations: { ...settings.integrations, cannedSmsTemplates: smsConfig } },
        { includeDisabled: true }
      ),
    [settings, smsConfig]
  );

  const updateTemplateItem = (
    id: string,
    isBuiltIn: boolean,
    patch: { label?: string; bodyTemplate?: string; enabled?: boolean; category?: CannedSmsTemplateCategory }
  ) => {
    setSmsConfig((prev) => {
      if (isBuiltIn) {
        const cur = prev.builtInOverrides[id] || {};
        return { ...prev, builtInOverrides: { ...prev.builtInOverrides, [id]: { ...cur, ...patch } } };
      }
      return {
        ...prev,
        customTemplates: prev.customTemplates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      };
    });
  };

  const handleAddCustomTemplate = () => {
    const id = `custom_${Date.now().toString(36)}`;
    setSmsConfig((prev) => ({
      ...prev,
      customTemplates: [
        ...prev.customTemplates,
        {
          id,
          label: 'Custom Passenger Update',
          category: 'custom',
          bodyTemplate:
            'Hi {passengerFirstName}, {driverName} is heading to {pickupShort} ({pickupDoor}). Track live: {trackingUrl}',
          enabled: true,
        },
      ],
    }));
    setSelectedTemplateId(id);
  };

  const handleInsertVariable = (token: string) => {
    const active = resolvedTemplates.find((t) => t.id === selectedTemplateId) || resolvedTemplates[0];
    if (!active) return;
    const spacer = active.bodyTemplate.endsWith(' ') || !active.bodyTemplate ? '' : ' ';
    updateTemplateItem(active.id, active.isBuiltIn, {
      bodyTemplate: `${active.bodyTemplate}${spacer}${token}`,
    });
  };

  const handleSaveSmsTemplates = async () => {
    setIsSavingSms(true);
    try {
      const normalized = normalizeCannedSmsTemplates(smsConfig);
      await onSave({
        integrations: { ...settings.integrations, cannedSmsTemplates: normalized },
      });
      setSmsConfig(normalized);
      onNotifySuccess('Canned Dispatch SMS templates saved and synced live to CommsHub.');
    } finally {
      setIsSavingSms(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-blue-600 shrink-0" />
              <span>Canned Dispatch SMS Templates ({resolvedTemplates.filter((t) => t.enabled).length} Active)</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Customize 1-click SMS chips in Dispatch CommsHub with live STL/SUS curbside door &amp; tracking interpolation.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setSmsConfig(DEFAULT_CANNED_SMS_TEMPLATES_CONFIG)} className="text-xs font-bold">
              <RefreshCwIcon className="w-3.5 h-3.5 mr-1" /> Reset Defaults
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleAddCustomTemplate} className="text-xs font-bold text-blue-700 border-blue-200 hover:bg-blue-50">
              <PlusIcon className="w-3.5 h-3.5 mr-1" /> Add Template
            </Button>
            <Button type="button" size="sm" onClick={handleSaveSmsTemplates} disabled={isSavingSms || isLoading} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">
              {isSavingSms ? 'Saving...' : 'Save Templates'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="p-3 rounded-xl border border-blue-100 bg-blue-50/40 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-700 mr-1">Insert Variable:</span>
          {VARIABLE_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => handleInsertVariable(token)}
              className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-[11px] font-mono font-semibold text-blue-800 hover:bg-blue-100 cursor-pointer"
            >
              {token}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {resolvedTemplates.map((tpl) => {
            const isSelected = selectedTemplateId === tpl.id;
            const previewText = interpolateCommsSmsTemplate({ bodyTemplate: tpl.bodyTemplate } as any, SAMPLE_PREVIEW_CONTEXT);
            return (
              <div
                key={tpl.id}
                onClick={() => setSelectedTemplateId(tpl.id)}
                className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                  isSelected ? 'border-blue-400 bg-blue-50/20 ring-1 ring-blue-300' : 'border-slate-200 bg-slate-50/40'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <Badge variant={tpl.isBuiltIn ? 'neutral' : 'info'}>{tpl.isBuiltIn ? 'Built-In' : 'Custom'}</Badge>
                    <input
                      type="text"
                      value={tpl.label}
                      onChange={(e) => updateTemplateItem(tpl.id, tpl.isBuiltIn, { label: e.target.value })}
                      className="flex-1 max-w-xs text-xs font-extrabold text-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tpl.enabled}
                        onChange={(e) => updateTemplateItem(tpl.id, tpl.isBuiltIn, { enabled: e.target.checked })}
                        className="w-3.5 h-3.5 rounded text-blue-600"
                      />
                      <span>Enabled</span>
                    </label>
                    {!tpl.isBuiltIn && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSmsConfig((prev) => ({
                            ...prev,
                            customTemplates: prev.customTemplates.filter((c) => c.id !== tpl.id),
                          }));
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Delete Custom Template"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={tpl.bodyTemplate}
                  onFocus={() => setSelectedTemplateId(tpl.id)}
                  onChange={(e) => updateTemplateItem(tpl.id, tpl.isBuiltIn, { bodyTemplate: e.target.value })}
                  className="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-200 bg-white"
                />

                <div className="text-[11px] text-slate-600 bg-white/80 px-2.5 py-1.5 rounded-lg border border-slate-100">
                  <strong className="text-slate-800">Live Preview:</strong> {previewText}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
