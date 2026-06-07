import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, FlatList, Image } from 'react-native';
import api from '../services/api';
import LoadingOverlay from '../components/LoadingOverlay';
import CoinsDisplay from '../components/CoinsDisplay';
import { useAuth } from '../context/AuthContext';

const TASK_TYPES = [
  { key: 'follow', label: 'Get Followers', cost: 8, reward: 5 },
  { key: 'like', label: 'Get Likes', cost: 5, reward: 3 },
  { key: 'comment', label: 'Get Comments', cost: 9, reward: 6 },
];

export default function CreateCampaignScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [taskType, setTaskType] = useState('follow');
  const [slots, setSlots] = useState('10');
  const [loading, setLoading] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getMyPosts();
        setPosts(data.posts || []);
      } catch {
        Alert.alert('Error', 'Could not load your posts. Make sure Instagram is connected.');
      } finally {
        setLoadingPosts(false);
      }
    })();
  }, []);

  const selectedType = TASK_TYPES.find(t => t.key === taskType);
  const totalCost = parseInt(slots || '0', 10) * (selectedType?.cost || 0);

  const handleCreate = async () => {
    if (!slots || parseInt(slots, 10) < 1) {
      Alert.alert('Error', 'Enter a valid slot count');
      return;
    }
    if (totalCost > (user?.coins || 0)) {
      Alert.alert('Not Enough Coins', `You need ${totalCost} coins but have ${user?.coins || 0}.`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        task_type: taskType,
        followers_wanted: parseInt(slots, 10),
      };
      if (taskType !== 'follow' && selectedPost) {
        payload.instagram_media_id = selectedPost.id;
        payload.instagram_media_permalink = selectedPost.permalink;
        payload.instagram_media_thumbnail = selectedPost.thumbnail_url;
        payload.instagram_media_caption = selectedPost.caption;
      }

      await api.createTask(payload);
      await refreshUser();
      Alert.alert('Campaign Created!', `You spent ${totalCost} coins.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.coinsRow}>
        <CoinsDisplay coins={user?.coins} />
        <Text style={styles.costText}>Cost: {totalCost} coins</Text>
      </View>

      <Text style={styles.label}>Task Type</Text>
      <View style={styles.typeRow}>
        {TASK_TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.typeChip, taskType === t.key && styles.typeActive]}
            onPress={() => setTaskType(t.key)}
          >
            <Text style={[styles.typeText, taskType === t.key && styles.typeTextActive]}>
              {t.label}
            </Text>
            <Text style={[styles.typeSub, taskType === t.key && styles.typeTextActive]}>
              {t.cost} coins/slot
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Number of Slots</Text>
      <TextInput
        style={styles.input}
        value={slots}
        onChangeText={setSlots}
        keyboardType="number-pad"
        placeholder="e.g. 10"
        placeholderTextColor="#555"
      />

      {taskType !== 'follow' && (
        <>
          <Text style={styles.label}>Select Post</Text>
          {loadingPosts ? (
            <Text style={styles.loadingText}>Loading your posts...</Text>
          ) : (
            <FlatList
              data={posts}
              horizontal
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.postItem, selectedPost?.id === item.id && styles.postSelected]}
                  onPress={() => setSelectedPost(item)}
                >
                  {item.thumbnail_url ? (
                    <Image source={{ uri: item.thumbnail_url }} style={styles.postThumb} />
                  ) : (
                    <View style={[styles.postThumb, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ color: '#666' }}>📷</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.loadingText}>No posts found</Text>}
              style={{ maxHeight: 120 }}
            />
          )}
        </>
      )}

      <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={loading}>
        <Text style={styles.createBtnText}>Create Campaign</Text>
      </TouchableOpacity>

      <LoadingOverlay visible={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 16 },
  coinsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20, backgroundColor: '#1a1a2e', padding: 12, borderRadius: 10,
  },
  costText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  label: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  typeChip: {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 10, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#333',
  },
  typeActive: { borderColor: '#E1306C', backgroundColor: '#2a1a22' },
  typeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  typeSub: { color: '#888', fontSize: 11, marginTop: 2 },
  typeTextActive: { color: '#E1306C' },
  input: {
    backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, color: '#fff',
    fontSize: 16, borderWidth: 1, borderColor: '#333',
  },
  postItem: { marginRight: 8, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  postSelected: { borderColor: '#E1306C' },
  postThumb: { width: 80, height: 80, borderRadius: 6 },
  loadingText: { color: '#666', fontSize: 13 },
  createBtn: {
    backgroundColor: '#E1306C', marginTop: 24, paddingVertical: 14,
    borderRadius: 10, alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
