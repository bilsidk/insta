import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Alert, Linking,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import api from '../services/api';
import { colors, borderRadius } from '../theme';

export default function PostDetailScreen({ route, navigation }) {
  const { task } = route.params;
  const { t } = useI18n();
  const { refreshUser } = useAuth();

  const [status, setStatus] = useState('idle');   // idle | countdown | ready | verifying | done | failed
  const [countdown, setCountdown] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const startedAtRef = useRef(null);
  const timerRef = useRef(null);

  const FALLBACK_DELAY_SECONDS = 30;

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCountdown = (seconds) => {
    setStatus('countdown');
    setCountdown(seconds);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setStatus('ready');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleOpen = () => {
    const url = task.instagram_media_permalink || `https://instagram.com/${task.owner_username}`;
    Linking.openURL(url).catch(() => Alert.alert(t('common.error'), 'Failed to open'));

    if (status === 'idle') {
      // Server records the verification baseline (follower/like count) at start;
      // its started_at and delay are authoritative
      startedAtRef.current = Date.now();
      startCountdown(FALLBACK_DELAY_SECONDS);
      api.startTask(task.id)
        .then(res => {
          if (res?.started_at) startedAtRef.current = res.started_at;
          if (res?.delay_seconds) {
            const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
            const remaining = Math.max(0, res.delay_seconds - elapsed);
            clearInterval(timerRef.current);
            if (remaining > 0) startCountdown(remaining);
            else setStatus('ready');
          }
        })
        .catch(() => {}); // offline → server falls back to client started_at
    }
  };

  const handleVerify = async () => {
    if (status === 'countdown') {
      Alert.alert(t('common.error'), `Wait ${countdown}s after opening in Instagram.`);
      return;
    }
    setStatus('verifying');
    setErrorMsg('');
    try {
      const res = await api.verifyTask(task.id, startedAtRef.current);
      if (res.verified) {
        setStatus('done');
        await refreshUser().catch(() => {});
        Alert.alert(
          res.degraded ? '⚠️ Coins Awarded' : '✅ Verified!',
          res.message || `+${res.coins_earned} coins`,
          [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
        );
      }
    } catch (err) {
      setStatus('failed');
      const remaining = err.message.match(/Wait (\d+)/)?.[1];
      if (remaining) {
        setErrorMsg(`Wait ${remaining}s more before verifying.`);
      } else {
        setErrorMsg(err.message || t('postDetail.notDetected'));
      }
    }
  };

  const steps = {
    follow:  t('postDetail.followSteps'),
    like:    t('postDetail.likeSteps'),
    comment: t('postDetail.commentSteps'),
  };

  const getVerifyLabel = () => {
    if (status === 'verifying') return t('postDetail.verifying');
    if (status === 'done')      return t('postDetail.verified');
    if (status === 'countdown') return `${t('postDetail.verify')} (${countdown}s)`;
    return t('postDetail.verify');
  };

  const verifyDisabled = status === 'verifying' || status === 'done' || status === 'idle';

  return (
    <ScrollView style={styles.container}>
      {task.instagram_media_thumbnail ? (
        <Image source={{ uri: task.instagram_media_thumbnail }} style={styles.image} />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.username}>@{task.owner_username}</Text>
        <Text style={styles.reward}>{t('postDetail.reward')}: +{task.reward} coins</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('postDetail.howToComplete')}</Text>
        <Text style={styles.steps}>{steps[task.task_type] || ''}</Text>
      </View>

      <TouchableOpacity style={styles.openBtn} onPress={handleOpen}>
        <Text style={styles.openBtnText}>{t('postDetail.openInstagram')}</Text>
      </TouchableOpacity>

      {status === 'idle' && (
        <Text style={styles.hint}>Open in Instagram first, then come back to verify.</Text>
      )}

      {status === 'countdown' && (
        <View style={styles.countdownBox}>
          <Text style={styles.countdownLabel}>Waiting for action…</Text>
          <Text style={styles.countdownTimer}>{countdown}s</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.verifyBtn, verifyDisabled && styles.verifyBtnDisabled]}
        onPress={handleVerify}
        disabled={verifyDisabled}
      >
        {status === 'verifying' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.verifyText}>{getVerifyLabel()}</Text>
        )}
      </TouchableOpacity>

      {(status === 'failed' || errorMsg) && (
        <Text style={styles.failed}>{errorMsg || t('postDetail.notDetected')}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  image: { width: '100%', height: 300 },
  section: { padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  username: { color: colors.text, fontSize: 18, fontWeight: '700' },
  reward: { color: colors.primary, fontSize: 15, fontWeight: '600', marginTop: 4 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  steps: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  openBtn: {
    backgroundColor: colors.link, margin: 16, paddingVertical: 14,
    borderRadius: borderRadius.md, alignItems: 'center',
  },
  openBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  countdownBox: {
    marginHorizontal: 16, marginBottom: 8, padding: 12,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: 0.5, borderColor: colors.border, alignItems: 'center',
  },
  countdownLabel: { color: colors.textSecondary, fontSize: 13 },
  countdownTimer: { color: colors.primary, fontSize: 28, fontWeight: '800', marginTop: 4 },
  verifyBtn: {
    backgroundColor: colors.primary, marginHorizontal: 16, marginTop: 8, paddingVertical: 14,
    borderRadius: borderRadius.md, alignItems: 'center',
  },
  verifyBtnDisabled: { opacity: 0.45 },
  verifyText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  failed: { color: colors.danger, textAlign: 'center', marginTop: 12, marginHorizontal: 16, fontSize: 14 },
});
