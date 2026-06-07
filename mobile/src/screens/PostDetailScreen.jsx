import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import api from '../services/api';
import LoadingOverlay from '../components/LoadingOverlay';

const ACTION_GUIDES = {
  follow: '1. Open the Instagram profile below\n2. Tap Follow\n3. Return here and tap Verify',
  like: '1. Open the Instagram post below\n2. Tap the heart icon to like\n3. Return here and tap Verify',
  comment: '1. Open the Instagram post below\n2. Leave a comment\n3. Return here and tap Verify',
};

export default function PostDetailScreen({ route, navigation }) {
  const { task } = route.params;
  const [verifying, setVerifying] = useState(false);

  const typeLabel = { follow: 'Follow', like: 'Like', comment: 'Comment' };

  const openInstagram = () => {
    if (task.instagram_media_permalink) {
      Linking.openURL(task.instagram_media_permalink).catch(() =>
        Alert.alert('Error', 'Could not open Instagram')
      );
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await api.verifyTask(task.id);
      Alert.alert('Success!', `You earned ${result.reward} coins.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Not Detected', err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={styles.container}>
      {task.instagram_media_thumbnail ? (
        <Image source={{ uri: task.instagram_media_thumbnail }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={styles.placeholderText}>Instagram Post</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.username}>@{task.owner_username}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{typeLabel[task.task_type] || task.task_type}</Text>
        </View>
        <Text style={styles.reward}>Reward: {task.reward} coins</Text>
        {task.instagram_media_caption && (
          <Text style={styles.caption} numberOfLines={3}>{task.instagram_media_caption}</Text>
        )}
      </View>

      <View style={styles.guide}>
        <Text style={styles.guideTitle}>How to complete:</Text>
        <Text style={styles.guideText}>{ACTION_GUIDES[task.task_type]}</Text>
      </View>

      <TouchableOpacity style={styles.openBtn} onPress={openInstagram}>
        <Text style={styles.openBtnText}>Open in Instagram</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify} disabled={verifying}>
        <Text style={styles.verifyBtnText}>{verifying ? 'Verifying...' : 'Verify & Earn'}</Text>
      </TouchableOpacity>

      <LoadingOverlay visible={verifying} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 16 },
  image: { width: '100%', height: 250, borderRadius: 12, backgroundColor: '#333', marginBottom: 16 },
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#666', fontSize: 14 },
  info: { marginBottom: 16 },
  username: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  badge: {
    alignSelf: 'flex-start', backgroundColor: '#E1306C', paddingHorizontal: 10,
    paddingVertical: 3, borderRadius: 4, marginBottom: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  reward: { color: '#FFD700', fontSize: 16, fontWeight: '700' },
  caption: { color: '#aaa', fontSize: 13, marginTop: 8, lineHeight: 18 },
  guide: { backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, marginBottom: 20 },
  guideTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  guideText: { color: '#aaa', fontSize: 13, lineHeight: 20 },
  openBtn: {
    backgroundColor: '#2626a0', paddingVertical: 14, borderRadius: 10,
    alignItems: 'center', marginBottom: 12,
  },
  openBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  verifyBtn: {
    backgroundColor: '#E1306C', paddingVertical: 14, borderRadius: 10,
    alignItems: 'center',
  },
  verifyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
