import { useLocalSearchParams } from 'expo-router';
import { SettingsPage } from '@/propose/screens/Settings';

export default function SettingsPageRoute() {
  const { page } = useLocalSearchParams<{ page: string }>();
  return <SettingsPage page={page} />;
}
