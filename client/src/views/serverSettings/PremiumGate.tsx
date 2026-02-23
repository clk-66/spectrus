import { Lock } from 'lucide-react';
import styles from './ServerSettings.module.css';

interface PremiumGateProps {
  isPremium: boolean;
  children: React.ReactNode;
}

export function PremiumGate({ isPremium, children }: PremiumGateProps) {
  if (isPremium) return <>{children}</>;

  return (
    <div className={styles.premiumGate}>
      <Lock className={styles.premiumGateLock} />
      <p className={styles.premiumGateLabel}>Premium Feature</p>
      <h3 className={styles.premiumGateTitle}>Unlock advanced branding</h3>
      <p className={styles.premiumGateDesc}>
        This feature requires a Spectrus Premium license. Customize your
        server's accent color and inject custom CSS to match your brand.
      </p>
      <a
        className={styles.premiumGateLink}
        href="https://spectrus.dev/docs/premium"
        target="_blank"
        rel="noopener noreferrer"
      >
        Learn about Spectrus Premium →
      </a>
    </div>
  );
}
