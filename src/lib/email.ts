import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendMagicLinkEmail(email: string, url: string) {
  const subject = 'Sign in to Oxla'
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Sign in to Oxla</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: #6366f1;
            margin-bottom: 10px;
          }
          .button {
            display: inline-block;
            background: #6366f1;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            margin: 20px 0;
          }
          .button:hover {
            background: #4f46e5;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Oxla</div>
            <h1>Sign in to your account</h1>
          </div>
          
          <p>Hello,</p>
          
          <p>Click the button below to sign in to your Oxla account. This magic link will expire in 24 hours.</p>
          
          <div style="text-align: center;">
            <a href="${url}" class="button">Sign In to Oxla</a>
          </div>
          
          <p>If you didn't request this email, you can safely ignore it.</p>
          
          <p>Alternatively, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; font-size: 12px; color: #6b7280;">${url}</p>
          
          <div class="footer">
            <p>This is an automated message from Oxla. Please do not reply to this email.</p>
            <p>© 2024 Oxla. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `

  try {
    const { data, error } = await resend.emails.send({
      from: 'Oxla <noreply@oxlas.com>',
      to: [email],
      subject,
      html,
    })

    if (error) {
      console.error('Error sending magic link email:', error)
      throw error
    }

    console.log(`Magic link email sent to ${email}`)
    return data
  } catch (error) {
    console.error('Error sending magic link email:', error)
    throw error
  }
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${resetToken}`
  const subject = 'Reset your Oxla password'
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Reset your Oxla password</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: #6366f1;
            margin-bottom: 10px;
          }
          .button {
            display: inline-block;
            background: #6366f1;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            margin: 20px 0;
          }
          .button:hover {
            background: #4f46e5;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Oxla</div>
            <h1>Reset your password</h1>
          </div>
          
          <p>Hello,</p>
          
          <p>We received a request to reset the password for your Oxla account. Click the button below to create a new password. This link will expire in 1 hour.</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          
          <p>If you didn't request this password reset, you can safely ignore this email.</p>
          
          <p>Alternatively, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; font-size: 12px; color: #6b7280;">${resetUrl}</p>
          
          <div class="footer">
            <p>This is an automated message from Oxla. Please do not reply to this email.</p>
            <p>© 2024 Oxla. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `

  try {
    const { data, error } = await resend.emails.send({
      from: 'Oxla <noreply@oxlas.com>',
      to: [email],
      subject,
      html,
    })

    if (error) {
      console.error('Error sending password reset email:', error)
      throw error
    }

    console.log(`Password reset email sent to ${email}`)
    return data
  } catch (error) {
    console.error('Error sending password reset email:', error)
    throw error
  }
}

export async function sendWelcomeEmail(email: string, name?: string) {
  const subject = 'Welcome to Oxla!'
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Welcome to Oxla</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: #6366f1;
            margin-bottom: 10px;
          }
          .button {
            display: inline-block;
            background: #6366f1;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            margin: 20px 0;
          }
          .button:hover {
            background: #4f46e5;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Oxla</div>
            <h1>Welcome to Oxla!${name ? `, ${name}` : ''}</h1>
          </div>
          
          <p>We're excited to have you join our community of innovators and creators.</p>
          
          <p>With Oxla, you can:</p>
          <ul>
            <li>🔍 Search with AI-powered intelligence</li>
            <li>💬 Collaborate in real-time with your team</li>
            <li>📊 Gain insights from comprehensive analytics</li>
            <li>🚀 Automate your workflow with powerful integrations</li>
          </ul>
          
          <div style="text-align: center;">
            <a href="${process.env.NEXTAUTH_URL}/dashboard" class="button">Get Started</a>
          </div>
          
          <p>If you have any questions or need help getting started, don't hesitate to reach out to our support team.</p>
          
          <div class="footer">
            <p>This is an automated message from Oxla. Please do not reply to this email.</p>
            <p>© 2024 Oxla. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `

  try {
    const { data, error } = await resend.emails.send({
      from: 'Oxla <noreply@oxlas.com>',
      to: [email],
      subject,
      html,
    })

    if (error) {
      console.error('Error sending welcome email:', error)
      throw error
    }

    console.log(`Welcome email sent to ${email}`)
    return data
  } catch (error) {
    console.error('Error sending welcome email:', error)
    throw error
  }
}

export async function sendSubscriptionEmail(email: string, type: 'created' | 'updated' | 'cancelled', planName: string) {
  const subjectMap = {
    created: `Welcome to ${planName}!`,
    updated: `Your subscription has been updated to ${planName}`,
    cancelled: `Your ${planName} subscription has been cancelled`
  }
  
  const subject = subjectMap[type]
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${subject}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: #6366f1;
            margin-bottom: 10px;
          }
          .button {
            display: inline-block;
            background: #6366f1;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            margin: 20px 0;
          }
          .button:hover {
            background: #4f46e5;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Oxla</div>
            <h1>${subject}</h1>
          </div>
          
          ${type === 'created' ? `
            <p>Congratulations! Your ${planName} subscription is now active.</p>
            <p>You now have access to all the features included in your plan. Start exploring what you can do with Oxla!</p>
          ` : ''}
          
          ${type === 'updated' ? `
            <p>Your subscription has been successfully updated to ${planName}.</p>
            <p>You now have access to all the features included in your new plan. The changes will take effect immediately.</p>
          ` : ''}
          
          ${type === 'cancelled' ? `
            <p>Your ${planName} subscription has been cancelled.</p>
            <p>You'll continue to have access to your plan until the end of your current billing period. After that, your account will be downgraded to the Free plan.</p>
          ` : ''}
          
          <div style="text-align: center;">
            <a href="${process.env.NEXTAUTH_URL}/billing" class="button">Manage Subscription</a>
          </div>
          
          <p>If you have any questions about your subscription, please contact our support team.</p>
          
          <div class="footer">
            <p>This is an automated message from Oxla. Please do not reply to this email.</p>
            <p>© 2024 Oxla. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `

  try {
    const { data, error } = await resend.emails.send({
      from: 'Oxla <noreply@oxlas.com>',
      to: [email],
      subject,
      html,
    })

    if (error) {
      console.error('Error sending subscription email:', error)
      throw error
    }

    console.log(`Subscription email (${type}) sent to ${email}`)
    return data
  } catch (error) {
    console.error('Error sending subscription email:', error)
    throw error
  }
}