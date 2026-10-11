import { loadConfig } from '@/lib/config.server';
import { SettingsView } from './settings-view';

export default async function SettingsPage() {
  const config = await loadConfig();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage portal configuration. Changes take effect on the next request.
        </p>
      </div>
      <SettingsView initialConfig={config} />
    </div>
  );
}
