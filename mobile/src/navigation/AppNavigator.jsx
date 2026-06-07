import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import FeedScreen from '../screens/FeedScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import CreateCampaignScreen from '../screens/CreateCampaignScreen';
import MyCampaignsScreen from '../screens/MyCampaignsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AdminScreen from '../screens/AdminScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }}>
        <ActivityIndicator size="large" color="#E1306C" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a1a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: '#111' },
      }}
    >
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Feed" component={FeedScreen} options={{ title: 'InstaGrowth' }} />
          <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: 'Engage' }} />
          <Stack.Screen name="CreateCampaign" component={CreateCampaignScreen} options={{ title: 'New Campaign' }} />
          <Stack.Screen name="MyCampaigns" component={MyCampaignsScreen} options={{ title: 'My Campaigns' }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
          {user.role === 'owner' && (
            <Stack.Screen name="Admin" component={AdminScreen} options={{ title: 'Admin' }} />
          )}
        </>
      )}
    </Stack.Navigator>
  );
}
