import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';

export default function PostCard({ task, onPress }) {
  const typeLabel = { follow: 'Follow', like: 'Like', comment: 'Comment' };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {task.instagram_media_thumbnail ? (
        <Image source={{ uri: task.instagram_media_thumbnail }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.placeholder]}>
          <Text style={styles.placeholderText}>Instagram</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.username}>@{task.owner_username}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{typeLabel[task.task_type] || task.task_type}</Text>
        </View>
        <Text style={styles.reward}>+{task.reward} coins</Text>
        <Text style={styles.slots}>{task.remaining_slots}/{task.total_slots} slots left</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  thumb: { width: 100, height: 100, backgroundColor: '#333' },
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#666', fontSize: 12 },
  info: { flex: 1, padding: 12, justifyContent: 'center' },
  username: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E1306C',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  reward: { color: '#FFD700', fontSize: 14, fontWeight: '700' },
  slots: { color: '#888', fontSize: 12, marginTop: 2 },
});
