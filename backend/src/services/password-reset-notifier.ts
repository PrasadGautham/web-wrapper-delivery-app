export interface PasswordResetNotificationTarget {
  userType: 'driver' | 'restaurant' | 'merchant' | 'admin';
  email: string;
  token: string;
}

export interface PasswordResetNotifier {
  sendPasswordReset(target: PasswordResetNotificationTarget): Promise<void>;
}

export class NoopPasswordResetNotifier implements PasswordResetNotifier {
  constructor(private readonly logger: { info: (message: unknown) => void }) {}

  async sendPasswordReset(target: PasswordResetNotificationTarget): Promise<void> {
    this.logger.info(
      `Password reset requested for ${target.userType}:${target.email}. Configure SMTP to deliver reset links automatically.`,
    );
  }
}

export class SmtpPasswordResetNotifier implements PasswordResetNotifier {
  private transporterPromise: Promise<{ sendMail: (input: Record<string, unknown>) => Promise<unknown> }> | null = null;

  constructor(
    private readonly config: {
      host: string;
      port: number;
      user: string | null;
      password: string | null;
      fromEmail: string;
      resetBaseUrl: string | null;
    },
  ) {}

  async sendPasswordReset(target: PasswordResetNotificationTarget): Promise<void> {
    const transporter = await this.getTransporter();
    const resetLink = this.config.resetBaseUrl
      ? `${this.config.resetBaseUrl}${this.config.resetBaseUrl.includes('?') ? '&' : '?'}userType=${encodeURIComponent(target.userType)}&token=${encodeURIComponent(target.token)}`
      : null;
    const text = [
      'A password reset was requested for your delivery platform account.',
      '',
      resetLink ? `Reset link: ${resetLink}` : `Reset token: ${target.token}`,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n');

    await transporter.sendMail({
      from: this.config.fromEmail,
      to: target.email,
      subject: 'Reset your delivery platform password',
      text,
      html: `<p>A password reset was requested for your delivery platform account.</p><p>${resetLink ? `<a href="${resetLink}">Reset your password</a>` : `Reset token: <strong>${target.token}</strong>`}</p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }

  private async getTransporter(): Promise<{ sendMail: (input: Record<string, unknown>) => Promise<unknown> }> {
    if (!this.transporterPromise) {
      this.transporterPromise = import('nodemailer').then(({ default: nodemailer }) =>
        nodemailer.createTransport({
          host: this.config.host,
          port: this.config.port,
          secure: this.config.port === 465,
          auth: this.config.user && this.config.password
            ? { user: this.config.user, pass: this.config.password }
            : undefined,
        }),
      );
    }
    return this.transporterPromise;
  }
}
