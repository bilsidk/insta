import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111', padding: 20 }}>
          <Text style={{ color: '#fff', fontSize: 18, marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ color: '#888', marginBottom: 20, textAlign: 'center' }}>{this.state.error.message}</Text>
          <TouchableOpacity
            style={{ backgroundColor: '#E1306C', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
