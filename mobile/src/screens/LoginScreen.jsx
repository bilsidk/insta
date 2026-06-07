import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { authorize } from 'react-native-app-auth';
import { useAuth } from '../context/AuthContext';
import LoadingOverlay from '../components/LoadingOverlay';
import InstagramAuth from '../services/instagramAuth';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const authCode = await InstagramAuth.initiateInstagramAuth(authorize);
      if (!authCode) { setLoading(false); return; }
      await signIn(authCode);
    } catch (err) {
      Alert.alert('Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <Text style={styles.logoIcon}>📷</Text>
        <Text style={styles.title}>InstaGrowth</Text>
        <Text style={styles.subtitle}>Grow your Instagram together</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>Sign in with Instagram</Text>
      </TouchableOpacity>

      <Text style={styles.disclaimer}>
        Connect your Instagram account to start earning and growing.
      </Text>
      <LoadingOverlay visible={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logo: { alignItems: 'center', marginBottom: 60 },
  logoIcon: { fontSize: 64, marginBottom: 16 },
  title: { color: '#fff', fontSize: 32, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 16, marginTop: 8 },
  button: {
    backgroundColor: '#E1306C',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  disclaimer: { color: '#555', fontSize: 12, marginTop: 24, textAlign: 'center' },
});
