import React, { useEffect, useState } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import { Alert } from '../../../ui/Alert';
import { CheckIcon } from '../../../ui/Icons';
import {
  DispatchEmailConfigPanel,
  FlightTrackingConfigPanel,
  PaymentGatewaysPanel,
  TelephonyAndSmsTemplatesPanel,
  WebhooksAndPushPanel,
} from '../integrations';

export type IntegrationsSubTab =
  | 'gateways'
  | 'telephony'
  | 'email'
  | 'flights'
  | 'webhooks';

interface AdminIntegrationsSubpageProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: IntegrationsSubTab;
}

const LEGACY_LOCAL_STORAGE_SECRET_KEYS = [
  'ct_stripe_sk',
  'ct_stripe_webhook',
  'ct_square_token',
  'ct_twilio_token',
  'ct_twilio_api_secret',
  'ct_qb_client_secret',
] as const;

export function AdminIntegrationsSubpage({
  settings,
  onSave,
  isLoading = false,
  initialSubTab = 'gateways',
}: AdminIntegrationsSubpageProps) {
  const [activeSub, setActiveSub] = useState<IntegrationsSubTab>(initialSubTab);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSub(initialSubTab);
    }
  }, [initialSubTab]);

  // Purge any legacy plaintext secrets from browser localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      LEGACY_LOCAL_STORAGE_SECRET_KEYS.forEach((secretKey) =>
        localStorage.removeItem(secretKey)
      );
    }
  }, []);

  const handleNotifySuccess = (message: string) => {
    setSaveSuccessMessage(message);
    setTimeout(() => setSaveSuccessMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {saveSuccessMessage && (
        <Alert variant="success" className="animate-fade-in">
          <CheckIcon className="w-4 h-4 mr-2 inline" />
          {saveSuccessMessage}
        </Alert>
      )}

      {activeSub === 'gateways' && (
        <PaymentGatewaysPanel
          settings={settings}
          onSave={onSave}
          onNotifySuccess={handleNotifySuccess}
          isLoading={isLoading}
        />
      )}

      {activeSub === 'telephony' && (
        <TelephonyAndSmsTemplatesPanel
          settings={settings}
          onSave={onSave}
          onNotifySuccess={handleNotifySuccess}
          isLoading={isLoading}
        />
      )}

      {activeSub === 'email' && (
        <DispatchEmailConfigPanel
          settings={settings}
          onSave={onSave}
          onNotifySuccess={handleNotifySuccess}
          isLoading={isLoading}
        />
      )}

      {activeSub === 'flights' && (
        <FlightTrackingConfigPanel
          settings={settings}
          onSave={onSave}
          onNotifySuccess={handleNotifySuccess}
          isLoading={isLoading}
        />
      )}

      {activeSub === 'webhooks' && <WebhooksAndPushPanel />}
    </div>
  );
}
