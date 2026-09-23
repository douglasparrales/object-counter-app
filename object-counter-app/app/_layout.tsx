import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { initDB } from '../db/client';

export default function RootLayout() {
  useEffect(() => {
    initDB();
  }, []);

  return <><StatusBar style="light" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#10151c' } }} /></>;
}
