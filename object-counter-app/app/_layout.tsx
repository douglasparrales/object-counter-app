import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { initDB } from '../db/client';
import { loadYOLOModel } from '../model/loadModel';

export default function RootLayout() {
  useEffect(() => {
  initDB();
  loadYOLOModel();
}, []);

  return <Stack />;
}