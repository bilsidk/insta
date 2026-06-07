import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

const STATUS_COLORS = { active: '#4CAF50', paused: '#FF9800', completed: '#555', cancelled: '#f44336' };

export default function MyCampaignsScreen() {
  const [campaigns, setCampaigns] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getMyTasks();
      setCampaigns(data);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleAction = async (id, action) => {
    try {
      const actions = { pause: api.pauseCampaign, resume: api.resumeCampaign, cancel: api.cancelCampaign };
      const result = await actions[action](id);
      Alert.alert('Done', result.message || `${action} successful`);
      load();
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const typeLabel = { follow: 'Followers', like: 'Likes', comment: 'Comments' };

  return (
    <View style={styles.container}>
      <FlatList
        data={campaigns}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.type}>{typeLabel[item.task_type] || item.task_type}</Text>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#555' }]}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>

            <Text style={styles.owner}>@{item.username}</Text>

            <View style={styles.stats}>
              <Text style={styles.stat}>Slots: {item.remaining_slots}/{item.total_slots}</Text>
              <Text style={styles.stat}>Completed: {item.completions_count || 0}</Text>
              <Text style={styles.stat}>Reward: {item.reward} coins</Text>
            </View>

            {(item.status === 'active' || item.status === 'paused') && (
              <View style={styles.actions}>
                {item.status === 'active' && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction(item.id, 'pause')}>
                    <Text style={styles.actionText}>Pause</Text>
                  </TouchableOpacity>
                )}
                {item.status === 'paused' && item.remaining_slots > 0 && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction(item.id, 'resume')}>
                    <Text style={styles.actionText}>Resume</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => handleAction(item.id, 'cancel')}>
                  <Text style={[styles.actionText, { color: '#f44336' }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E1306C" />}
        ListEmptyComponent={<Text style={styles.empty}>No campaigns yet</Text>}
        contentContainerStyle={campaigns.length === 0 && { flex: 1, justifyContent: 'center' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  card: { backgroundColor: '#1a1a2e', margin: 12, borderRadius: 12, padding: 16, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  type: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  owner: { color: '#888', fontSize: 13, marginBottom: 8 },
  stats: { gap: 4, marginBottom: 12 },
  stat: { color: '#ccc', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#333',
  },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cancelBtn: { borderWidth: 1, borderColor: '#f44336', backgroundColor: 'transparent' },
  empty: { color: '#555', textAlign: 'center', fontSize: 15 },
});
