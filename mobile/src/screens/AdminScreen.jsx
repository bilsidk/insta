import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import api from '../services/api';

export default function AdminScreen() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getAdminStatus();
        setStatus(data);
        setSettings(data.settings || {});
      } catch (err) {
        Alert.alert('Error', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    try {
      await api.updateAdminSettings(settings);
      Alert.alert('Saved');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const toggleMode = async () => {
    const newMode = status?.mode === 'live' ? 'degraded' : 'live';
    try {
      await api.setAdminMode(newMode, 'Manual toggle');
      setStatus(s => ({ ...s, mode: newMode }));
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const SETTING_FIELDS = [
    { key: 'daily_limit_user', label: 'Daily Limit (User)' },
    { key: 'daily_limit_premium', label: 'Daily Limit (Premium)' },
    { key: 'coins_follow', label: 'Coins/Follow' },
    { key: 'coins_like', label: 'Coins/Like' },
    { key: 'coins_comment', label: 'Coins/Comment' },
    { key: 'coins_per_slot', label: 'Coins Per Slot (refund)' },
    { key: 'completion_delay_seconds', label: 'Completion Delay (s)' },
    { key: 'max_campaigns_per_user', label: 'Max Campaigns/User' },
  ];

  if (loading) return <View style={styles.container}><Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>Loading...</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.modeRow}>
        <Text style={styles.modeLabel}>API Mode:</Text>
        <TouchableOpacity
          style={[styles.modeBtn, { backgroundColor: status?.mode === 'live' ? '#4CAF50' : '#f44336' }]}
          onPress={toggleMode}
        >
          <Text style={styles.modeBtnText}>{status?.mode?.toUpperCase() || 'UNKNOWN'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{status?.stats?.total_users || 0}</Text>
          <Text style={styles.statLabel}>Users</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{status?.stats?.active_campaigns || 0}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{status?.stats?.daily_completions || 0}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{status?.stats?.daily_revenue || 0}</Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Settings</Text>
      {SETTING_FIELDS.map(field => (
        <View key={field.key} style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <TextInput
            style={styles.fieldInput}
            value={String(settings[field.key] ?? '')}
            onChangeText={val => setSettings(s => ({ ...s, [field.key]: parseInt(val, 10) || 0 }))}
            keyboardType="number-pad"
          />
        </View>
      ))}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  content: { padding: 16 },
  modeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modeLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modeBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  modeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  statCard: {
    backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, width: '48%', alignItems: 'center',
  },
  statVal: { color: '#fff', fontSize: 24, fontWeight: '700' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  fieldRow: { marginBottom: 12 },
  fieldLabel: { color: '#ccc', fontSize: 13, marginBottom: 4 },
  fieldInput: {
    backgroundColor: '#1a1a2e', borderRadius: 8, padding: 12, color: '#fff',
    fontSize: 15, borderWidth: 1, borderColor: '#333',
  },
  saveBtn: {
    backgroundColor: '#E1306C', marginTop: 16, paddingVertical: 14,
    borderRadius: 10, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
