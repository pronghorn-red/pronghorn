import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendAuthEmailRequest {
  type: 'signup' | 'recovery';
  email: string;
  password?: string; // Required for signup
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    
    const { type, email, password }: SendAuthEmailRequest = await req.json();
    
    console.log(`Processing ${type} email for: ${email}`);

    if (!email) {
      throw new Error("Email is required");
    }

    const baseUrl = "https://pronghorn.red";
    let actionUrl: string;
    let subject: string;
    let heading: string;
    let message: string;
    let buttonText: string;

    if (type === 'signup') {
      if (!password) {
        throw new Error("Password is required for signup");
      }

      // Generate signup confirmation link using admin API
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email: email,
        password: password,
        options: {
          redirectTo: `${baseUrl}/auth`
        }
      });

      if (linkError) {
        console.error("Error generating signup link:", linkError);
        throw new Error(`Failed to generate verification link: ${linkError.message}`);
      }

      // Extract the verification URL from the action_link
      // The action_link contains the full URL with token_hash and type
      actionUrl = linkData.properties.action_link;
      
      // Modify the redirect to go to our auth page
      const url = new URL(actionUrl);
      const token_hash = url.searchParams.get('token_hash') || url.searchParams.get('token');
      const linkType = url.searchParams.get('type');
      
      // Build our custom verification URL
      actionUrl = `${baseUrl}/auth?token_hash=${token_hash}&type=${linkType}`;
      
      console.log("Generated verification URL:", actionUrl);

      subject = "Verify your Pronghorn account";
      heading = "Welcome to Pronghorn!";
      message = "Please verify your email address to complete your account setup and access all features.";
      buttonText = "Verify Email Address";

    } else if (type === 'recovery') {
      // Generate password recovery link using admin API
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: email,
        options: {
          redirectTo: `${baseUrl}/auth`
        }
      });

      if (linkError) {
        console.error("Error generating recovery link:", linkError);
        throw new Error(`Failed to generate recovery link: ${linkError.message}`);
      }

      // Extract the recovery URL
      actionUrl = linkData.properties.action_link;
      
      // Modify the redirect to go to our auth page
      const url = new URL(actionUrl);
      const token_hash = url.searchParams.get('token_hash') || url.searchParams.get('token');
      const linkType = url.searchParams.get('type');
      
      // Build our custom recovery URL
      actionUrl = `${baseUrl}/auth?token_hash=${token_hash}&type=${linkType}`;
      
      console.log("Generated recovery URL:", actionUrl);

      subject = "Reset your Pronghorn password";
      heading = "Password Reset Request";
      message = "You requested to reset your password. Click the button below to set a new password. This link expires in 24 hours.";
      buttonText = "Reset Password";

    } else {
      throw new Error("Invalid email type");
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
          <tr>
            <td style="padding: 40px 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 32px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${heading}</h1>
                  </td>
                </tr>
                
                <!-- Main Content -->
                <tr>
                  <td style="padding: 40px;">
                    <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.6;">
                      ${message}
                    </p>
                    
                    <!-- CTA Button -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="text-align: center; padding: 16px 0;">
                          <a href="${actionUrl}" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                            ${buttonText}
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Alternative Link -->
                    <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="margin: 8px 0 0; word-break: break-all;">
                      <a href="${actionUrl}" style="color: #dc2626; font-size: 14px;">${actionUrl}</a>
                    </p>
                    
                    ${type === 'signup' ? `
                    <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      If you didn't create a Pronghorn account, you can safely ignore this email.
                    </p>
                    ` : `
                    <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
                    </p>
                    `}
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 24px 40px; border-top: 1px solid #e5e7eb;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="text-align: center;">
                          <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">
                            <a href="${baseUrl}" style="color: #dc2626; text-decoration: none; font-weight: 500;">pronghorn.red</a>
                          </p>
                          <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                            © ${new Date().getFullYear()} Pronghorn. All rights reserved.
                          </p>
                          <p style="margin: 8px 0 0; color: #9ca3af; font-size: 12px;">
                            This is an automated message. Please do not reply to this email.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "Pronghorn <info@pronghorn.red>",
      to: [email],
      subject: subject,
      html: htmlContent,
    });

    console.log("Resend API response:", JSON.stringify(emailResponse, null, 2));

    if (emailResponse.error) {
      console.error("Resend API error:", emailResponse.error);
      throw new Error(`Email sending failed: ${emailResponse.error.message || "Unknown error"}`);
    }

    if (!emailResponse.data?.id) {
      console.error("No message ID returned from Resend");
      throw new Error("Email sending failed: No message ID returned");
    }

    console.log(`Email sent successfully, message ID:`, emailResponse.data.id);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: emailResponse.data.id,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-auth-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
