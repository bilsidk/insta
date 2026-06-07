import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CoinsDisplay({ coins, size = 'md' }) {
  const fontSize = size === 'lg' ? 24 : 16;
  return (
    <View style={styles.container}>
      <Text style={[styles.icon]}>◆</Text>
      <Text style={[styles.amount, { fontSize }]}>{coins ?? 0}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  icon: { color: '#FFD700', fontSize: 14 },
  amount: { color: '#FFD700', fontWeight: '700' },
});
