import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import CoinsDisplay from '../components/CoinsDisplay';
import api from '../services/api';

export default function ProfileScreen({ navigation }) {
  const { user, signOut } = useAuth();

  const handleDelete = () => {
    Alert.alert(
      'Delete Account',
      'This cannot be undone. All data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteAccount();
            await signOut();
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        }},
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </Text>
      </View>
      <Text style={styles.name}>{user?.name || 'User'}</Text>
      <CoinsDisplay coins={user?.coins} size="lg" />
      <Text style={styles.email}>{user?.email || ''}</Text>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{user?.tasks_completed || 0}</Text>
          <Text style={styles.statLabel}>Tasks Done</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{user?.campaigns_count || 0}</Text>
          <Text style={styles.statLabel}>Campaigns</Text>
        </View>
      </View>

      <View style={styles.links}>
        <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('MyCampaigns')}>
          <Text style={styles.linkText}>My Campaigns</Text>
        </TouchableOpacity>
        {user?.role === 'owner' && (
          <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Admin')}>
            <Text style={styles.linkText}>Admin Panel</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.link} onPress={() => api.disconnectInstagram()}>
          <Text style={styles.linkText}>Disconnect Instagram</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.link, styles.logoutLink]} onPress={signOut}>
          <Text style={[styles.linkText, { color: '#E1306C' }]}>Sign Out</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.link, styles.deleteLink]} onPress={handleDelete}>
          <Text style={[styles.linkText, { color: '#f44336' }]}>Delete Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  content: { alignItems: 'center', padding: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#E1306C',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  name: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  email: { color: '#888', fontSize: 13, marginTop: 8 },
  stats: {
    flexDirection: 'row', marginTop: 24, gap: 40,
    backgroundColor: '#1a1a2e', padding: 20, borderRadius: 12, width: '100%',
    justifyContent: 'center',
  },
  statItem: { alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '700' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  links: { width: '100%', marginTop: 24, gap: 8 },
  link: {
    backgroundColor: '#1a1a2e', padding: 16, borderRadius: 10, alignItems: 'center',
  },
  linkText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  logoutLink: { marginTop: 8 },
  deleteLink: { borderWidth: 1, borderColor: '#f44336', backgroundColor: 'transparent' },
});
