import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Mail, Bell, Megaphone, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Preferences {
  marketing: boolean;
  transactional: boolean;
  sequences: boolean;
}

interface EmailPreferencesData {
  email: string;
  subscribed: boolean;
  preferences: Preferences;
  unsubscribed_at?: string;
}

const EmailPreferences = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefsData, setPrefsData] = useState<EmailPreferencesData | null>(null);

  useEffect(() => {
    if (email && token) {
      fetchPreferences();
    } else {
      setLoading(false);
    }
  }, [email, token]);

  const fetchPreferences = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('unsubscribe', {
        body: null,
        method: 'GET',
      });

      // Use fetch directly since we need query params
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unsubscribe?email=${encodeURIComponent(email!)}&token=${token}&action=preferences`
      );
      
      const result = await response.json();
      
      if (result.success) {
        setPrefsData(result.preferences);
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
      toast.error('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (newPrefs: Partial<EmailPreferencesData>) => {
    if (!email || !token) return;
    
    setSaving(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unsubscribe?email=${encodeURIComponent(email)}&token=${token}&action=update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscribed: newPrefs.subscribed ?? prefsData?.subscribed,
            preferences: newPrefs.preferences ?? prefsData?.preferences
          })
        }
      );
      
      const result = await response.json();
      
      if (result.success) {
        setPrefsData(prev => prev ? { ...prev, ...newPrefs } : null);
        toast.success('Preferences updated successfully');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error('Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  const togglePreference = (key: keyof Preferences) => {
    if (!prefsData) return;
    
    const newPreferences = {
      ...prefsData.preferences,
      [key]: !prefsData.preferences[key]
    };
    
    // Check if all are being turned off
    const allOff = !newPreferences.marketing && !newPreferences.sequences;
    
    updatePreferences({
      preferences: newPreferences,
      subscribed: !allOff || newPreferences.transactional
    });
  };

  const unsubscribeAll = () => {
    updatePreferences({
      subscribed: false,
      preferences: { marketing: false, transactional: true, sequences: false }
    });
  };

  const resubscribeAll = () => {
    updatePreferences({
      subscribed: true,
      preferences: { marketing: true, transactional: true, sequences: true }
    });
  };

  if (!email || !token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Invalid Link</CardTitle>
            <CardDescription>
              This email preferences link is invalid or has expired.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Email Preferences</CardTitle>
          <CardDescription>
            Manage your email subscription settings for <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Current Status */}
          <div className={`p-4 rounded-lg ${prefsData?.subscribed ? 'bg-green-500/10 border border-green-500/20' : 'bg-yellow-500/10 border border-yellow-500/20'}`}>
            <div className="flex items-center gap-2">
              <CheckCircle className={`h-5 w-5 ${prefsData?.subscribed ? 'text-green-500' : 'text-yellow-500'}`} />
              <span className="font-medium">
                {prefsData?.subscribed ? 'You are subscribed' : 'You are unsubscribed from marketing emails'}
              </span>
            </div>
          </div>

          {/* Preference Toggles */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Email Types</h3>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Megaphone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">Marketing Emails</Label>
                  <p className="text-sm text-muted-foreground">Promotions, newsletters, and updates</p>
                </div>
              </div>
              <Switch
                checked={prefsData?.preferences?.marketing ?? true}
                onCheckedChange={() => togglePreference('marketing')}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">Email Sequences</Label>
                  <p className="text-sm text-muted-foreground">Automated follow-up emails</p>
                </div>
              </div>
              <Switch
                checked={prefsData?.preferences?.sequences ?? true}
                onCheckedChange={() => togglePreference('sequences')}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">Transactional Emails</Label>
                  <p className="text-sm text-muted-foreground">Important account notifications (always enabled)</p>
                </div>
              </div>
              <Switch
                checked={true}
                disabled={true}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            {prefsData?.subscribed ? (
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={unsubscribeAll}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Unsubscribe from All Marketing
              </Button>
            ) : (
              <Button 
                className="flex-1" 
                onClick={resubscribeAll}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Resubscribe to All
              </Button>
            )}
          </div>

          <p className="text-xs text-center text-muted-foreground">
            You'll always receive important transactional emails about your account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailPreferences;
