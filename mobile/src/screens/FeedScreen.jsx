import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import PostCard from '../components/PostCard';
import CoinsDisplay from '../components/CoinsDisplay';
import { useAuth } from '../context/AuthContext';

export default function FeedScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.getTasks(filter);
      setTasks(data);
    } catch {}
  }, [filter]);

  useFocusEffect(useCallback(() => { loadTasks(); }, [loadTasks]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTasks(), refreshUser()]);
    setRefreshing(false);
  };

  const filters = ['follow', 'like', 'comment'];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Text style={styles.profileBtn}>Profile</Text>
        </TouchableOpacity>
        <CoinsDisplay coins={user?.coins} />
      </View>

      <View style={styles.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterActive]}
            onPress={() => setFilter(filter === f ? null : f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.createBtn}
        onPress={() => navigation.navigate('CreateCampaign')}
      >
        <Text style={styles.createBtnText}>+ Create Campaign</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.myBtn}
        onPress={() => navigation.navigate('MyCampaigns')}
      >
        <Text style={styles.myBtnText}>My Campaigns</Text>
      </TouchableOpacity>

      <FlatList
        data={tasks}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <PostCard task={item} onPress={() => navigation.navigate('PostDetail', { task: item })} />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E1306C" />}
        ListEmptyComponent={
          <Text style={styles.empty}>No tasks available{'\n'}Pull to refresh</Text>
        }
        contentContainerStyle={tasks.length === 0 && { flex: 1, justifyContent: 'center' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  profileBtn: { color: '#E1306C', fontSize: 15, fontWeight: '600' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#222', borderWidth: 1, borderColor: '#333',
  },
  filterActive: { borderColor: '#E1306C', backgroundColor: '#2a1a22' },
  filterText: { color: '#888', fontSize: 13, fontWeight: '500' },
  filterTextActive: { color: '#E1306C' },
  createBtn: {
    backgroundColor: '#E1306C', marginHorizontal: 16, marginBottom: 8,
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  myBtn: {
    borderColor: '#E1306C', borderWidth: 1, marginHorizontal: 16, marginBottom: 12,
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
  myBtnText: { color: '#E1306C', fontSize: 15, fontWeight: '600' },
  empty: { color: '#555', textAlign: 'center', fontSize: 15 },
});
