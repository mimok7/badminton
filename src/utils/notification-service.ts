// 알림 시스템 유틸리티
const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true';
let notificationSystemInitialized = false;

export class NotificationService {
  private static audioContext: AudioContext | null = null;
  private static notificationSound: HTMLAudioElement | null = null;

  // 브라우저 알림 권한 요청
  static async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('이 브라우저는 알림을 지원하지 않습니다.');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  // 소리 초기화
  static initializeSound() {
    try {
      // 알림 소리 파일 생성 (beep 사운드)
      if (!this.notificationSound) {
        this.notificationSound = new Audio();
        // 간단한 beep 사운드를 data URL로 생성
        this.notificationSound.src = this.generateBeepSound();
        this.notificationSound.volume = 0.5;
      }
    } catch (error) {
      console.error('소리 초기화 실패:', error);
    }
  }

  // Beep 사운드 생성
  private static generateBeepSound(): string {
    // Web Audio API를 사용한 beep 사운드 생성
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // 간단한 beep 톤 생성을 위한 data URL
    return "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+PiuyYGSHfN8t2MNwgbZrfuzcaKOEAkOCllr+fqyXEoEAl5yfLegzkFJl2r7d2WOgcNfMPy2YY8AxBYqOLcoWA2DCp9vu4kBgJdWfKPhkMDAm6V2eTLgR6BhE//WKvPWm1XwVcFWNmfJQ==";
  }

  // 소리 재생
  static async playNotificationSound() {
    try {
      if (!this.notificationSound) {
        this.initializeSound();
      }

      if (this.notificationSound) {
        // 사운드 재생 전 현재 시간을 0으로 리셋
        this.notificationSound.currentTime = 0;
        await this.notificationSound.play();
      }
    } catch (error) {
      console.warn('알림 소리 재생 실패:', error);
      // 소리 재생 실패 시 대체 방법으로 시스템 beep
      this.playSystemBeep();
    }
  }

  // 시스템 beep 소리 (대체 방법)
  private static playSystemBeep() {
    try {
      // Web Audio API를 사용한 간단한 beep
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = 800; // 800Hz beep
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('시스템 beep 재생 실패:', error);
    }
  }

  // 브라우저 푸시 알림 표시
  static async showBrowserNotification(title: string, message: string, options?: {
    icon?: string;
    badge?: string;
    tag?: string;
    requireInteraction?: boolean;
  }) {
    const hasPermission = await this.requestPermission();
    
    if (!hasPermission) {
      console.warn('알림 권한이 없어 브라우저 알림을 표시할 수 없습니다.');
      return;
    }

    try {
      const notification = new Notification(title, {
        body: message,
        icon: options?.icon || '/favicon.ico',
        badge: options?.badge || '/favicon.ico',
        tag: options?.tag || 'match-notification',
        requireInteraction: options?.requireInteraction || false,
        // 자동으로 5초 후 사라지도록 설정
        silent: false
      });

      // 알림 클릭 시 창 포커스
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // 5초 후 자동 닫기
      setTimeout(() => {
        notification.close();
      }, 5000);

      return notification;
    } catch (error) {
      console.error('브라우저 알림 표시 실패:', error);
    }
  }

  // 종합 알림 발송 (소리 + 브라우저 알림 + 콘솔)
  static async sendNotification(title: string, message: string, options?: {
    playSound?: boolean;
    showBrowserNotification?: boolean;
    icon?: string;
  }) {
    const {
      playSound = true,
      showBrowserNotification = true,
      icon
    } = options || {};

    if (debugEnabled) {
      console.log(`🔔 알림: ${title} - ${message}`);
    }

    // 소리 재생
    if (playSound) {
      await this.playNotificationSound();
    }

    // 브라우저 알림 표시
    if (showBrowserNotification) {
      await this.showBrowserNotification(title, message, {
        icon,
        requireInteraction: false,
        tag: 'badminton-match'
      });
    }
  }

  // 경기 준비 알림 전용
  static async sendMatchPreparationNotification(matchNumber: number, playerNames: string[]) {
    const title = '🏸 배드민턴 경기 준비 알림';
    const message = `경기 #${matchNumber} 준비해주세요!\n참가자: ${playerNames.join(', ')}\n\n빈 코트로 이동하여 경기를 시작해주세요.\n부상 없이 즐거운 운동 하세요!`;

    await this.sendNotification(title, message, {
      playSound: true,
      showBrowserNotification: true,
      icon: '🏸'
    });
  }

  // 페이지가 백그라운드에 있을 때 더 강한 알림
  static async sendUrgentNotification(title: string, message: string) {
    // 더 긴 beep 소리
    await this.playNotificationSound();
    
    // 짧은 간격으로 한 번 더 소리
    setTimeout(async () => {
      await this.playNotificationSound();
    }, 500);

    // 브라우저 알림은 사용자 상호작용이 필요하도록 설정
    await this.showBrowserNotification(title, message, {
      requireInteraction: true,
      tag: 'urgent-match-notification'
    });
  }
}

// 페이지 로드 시 알림 시스템 초기화
export const initializeNotificationSystem = async () => {
  if (notificationSystemInitialized) {
    return;
  }

  notificationSystemInitialized = true;

  // 권한 요청
  await NotificationService.requestPermission();
  
  // 소리 초기화
  NotificationService.initializeSound();
  
  if (debugEnabled) {
    console.log('🔔 알림 시스템 초기화 완료');
  }
};
