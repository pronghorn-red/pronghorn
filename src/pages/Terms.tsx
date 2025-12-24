import { Link } from "react-router-dom";
import { PronghornLogo } from "@/components/layout/PronghornLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlertTriangle, ExternalLink } from "lucide-react";

export default function Terms() {
  const thirdPartyServices = [
    { name: "Lovable", url: "https://lovable.dev/terms" },
    { name: "Supabase", url: "https://supabase.com/terms" },
    { name: "Google Cloud", url: "https://cloud.google.com/terms" },
    { name: "Microsoft Azure", url: "https://azure.microsoft.com/en-us/support/legal/subscription-agreement/" },
    { name: "GitHub", url: "https://docs.github.com/site-policy/github-terms/github-terms-of-service" },
    { name: "Render.com", url: "https://render.com/terms" },
  ];

  return (
    <div className="public-page">
      {/* Skip Navigation */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 public-btn-primary focus:rounded-lg"
      >
        Skip to main content
      </a>

      {/* Navbar */}
      <header>
        <nav role="navigation" aria-label="Main navigation" className="fixed top-0 left-0 right-0 z-50 public-nav">
          <div className="container mx-auto px-6 py-4 flex justify-between items-center">
            <Link to="/" className="flex items-center gap-3">
              <PronghornLogo className="h-8 w-8" />
              <span className="text-xl font-semibold tracking-tight public-heading">
                Pronghorn{" "}
                <Link to="/terms" className="public-brand underline decoration-1 underline-offset-2 text-sm font-normal hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]">
                  (Alpha)
                </Link>
              </span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link to="/privacy" className="public-text-muted hover:text-[var(--public-brand)] transition-colors underline decoration-1 underline-offset-2">
                Privacy
              </Link>
              <Link to="/license" className="public-text-muted hover:text-[var(--public-brand)] transition-colors underline decoration-1 underline-offset-2">
                License
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main role="main" id="main-content" className="container mx-auto px-6 pt-32 pb-16 max-w-4xl">
        <p className="text-sm public-text-muted uppercase tracking-wider mb-2">Terms & Conditions</p>
        <h1 className="text-4xl font-medium tracking-tight mb-4 public-heading">Terms of Use</h1>
        <p className="text-lg public-text-muted mb-8">
          Please read these terms carefully before using the Pronghorn platform and services.
        </p>
        <p className="text-sm public-text-muted mb-8">Last updated: December 10, 2025</p>

        <div className="prose max-w-none space-y-6 public-prose">

          {/* Alpha Testing Notice */}
          <div className="my-8 p-6 public-alert-amber rounded-xl not-prose">
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-1" />
              <div>
                <h2 className="text-xl font-semibold public-alert-amber-heading mb-3">Alpha Testing Notice</h2>
                <div className="space-y-3">
                  <p>
                    <strong>The Government of Alberta is currently testing this application.</strong> Pronghorn is in active 
                    development and is being evaluated for potential use in government operations.
                  </p>
                  <p>
                    <strong>Features are subject to change without notice.</strong> Functionality may be added, modified, 
                    or removed at any time during the testing period.
                  </p>
                  <p>
                    <strong>No guarantee of data retention.</strong> Projects, accounts, repositories, services, databases, 
                    and any other artifacts created within or imported to Pronghorn may be deleted without notice. We bear 
                    no liability for the loss of work.
                  </p>
                  <p className="text-sm public-alert-amber-highlight p-4 rounded-lg">
                    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
                    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR 
                    PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE GOVERNMENT OF ALBERTA, ITS MINISTERS, OFFICERS, EMPLOYEES, 
                    OR AGENTS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR 
                    OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <h2 className="public-heading">Agreement to Terms</h2>
          <p>
            By accessing and using the Pronghorn platform, you agree to be bound by these Terms of Use and all applicable 
            laws and regulations. If you do not agree with any of these terms, you are prohibited from using this service.
          </p>

          <h2 className="public-heading">Purpose and AI Capabilities</h2>
          <p>
            This site is provided for software development and project management purposes. The Government of Alberta makes 
            available certain AI capabilities, but does not guarantee the accuracy of AI-generated statements or outputs. 
            All AI-generated content should be reviewed and verified independently before use.
          </p>
          <p>
            Users are responsible for evaluating the accuracy, completeness, and usefulness of any information, opinions, 
            advice, or other content available through the service.
          </p>

          <h2 className="public-heading">Acceptable Use Policy</h2>
          <h3 className="public-heading">Prohibited Activities</h3>
          <p>
            Any abuse of this system, including offensive behavior or materials is strictly prohibited and may result in 
            the suspension or removal of accounts. Prohibited activities include but are not limited to:
          </p>
          <ul>
            <li>Harassment, bullying, or threatening behavior toward other users</li>
            <li>Posting or sharing offensive, discriminatory, or inappropriate content</li>
            <li>Attempting to hack, disrupt, or compromise the security of the platform</li>
            <li>Using the service for illegal activities or violating applicable laws</li>
            <li>Impersonating others or providing false information</li>
          </ul>

          <h2 className="public-heading">Service Availability</h2>
          <p>
            We do not guarantee continuous access to this system. At any future point, Alberta may remove parts or all of 
            this service due to operational needs, budget constraints, or other factors beyond our control.
          </p>
          <p>
            We reserve the right to modify, suspend, or discontinue the service at any time without prior notice. We are 
            not liable for any inconvenience or loss resulting from service interruptions or discontinuation.
          </p>

          {/* Third-Party Services */}
          <h2 className="public-heading">Third-Party Services</h2>
          <p>
            Pronghorn relies on several third-party services to provide its functionality. By using Pronghorn, you also 
            agree to the terms of service of these providers:
          </p>
          <div className="not-prose my-6 grid gap-3">
            {thirdPartyServices.map((service) => (
              <a
                key={service.name}
                href={service.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 public-card rounded-lg hover:border-[var(--public-brand)] hover:shadow-md transition-all group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]"
              >
                <span className="font-medium public-heading">{service.name}</span>
                <ExternalLink className="w-4 h-4 public-text-subtle group-hover:text-[var(--public-brand)] transition-colors" />
              </a>
            ))}
          </div>

          <h2 className="public-heading">Third-Party Resources</h2>
          <p>
            This site may link to third-party resources. We do not claim these resources as our own, nor do we necessarily 
            support the viewpoints or opinions of those individuals or organizations. External links are provided for 
            convenience and informational purposes only.
          </p>
          <p>
            We are not responsible for the content, accuracy, or availability of external websites or resources. Your use 
            of third-party websites is at your own risk and subject to their respective terms and conditions.
          </p>

          <h2 className="public-heading">Intellectual Property</h2>
          <h3 className="public-heading">Platform Content</h3>
          <p>
            The content, features, and functionality of the Pronghorn platform are owned by the Government of Alberta and 
            are protected by copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, 
            or create derivative works without explicit permission.
          </p>
          <h3 className="public-heading">User-Generated Content</h3>
          <p>
            You retain ownership of content you create using the platform, but grant the Government of Alberta a non-exclusive license to 
            use, modify, and display such content for operational purposes. You are responsible for ensuring your content 
            does not infringe on others' intellectual property rights.
          </p>

          <h2 className="public-heading">User Accounts and Responsibilities</h2>
          <h3 className="public-heading">Account Security</h3>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that 
            occur under your account. You must notify us immediately of any unauthorized use of your account or any other 
            security breach.
          </p>
          <h3 className="public-heading">Accurate Information</h3>
          <p>
            You agree to provide accurate, current, and complete information during registration and to update such 
            information as necessary to maintain its accuracy and completeness.
          </p>

          <h2 className="public-heading">Disclaimers and Limitations of Liability</h2>
          <h3 className="public-heading">Service Disclaimer</h3>
          <p>
            The service is provided "as is" without warranties of any kind, either express or implied. We do not warrant 
            that the service will be uninterrupted, error-free, or completely secure. Use of the service is at your own risk.
          </p>
          <h3 className="public-heading">Limitation of Liability</h3>
          <p>
            To the maximum extent permitted by law, the Government of Alberta shall not be liable for any 
            indirect, incidental, special, consequential, or punitive damages arising from your use of the service, even 
            if we have been advised of the possibility of such damages.
          </p>

          <h2 className="public-heading">Data Usage and Analytics</h2>
          <p>
            We may collect and analyze usage data to improve the platform functionality. This includes interaction patterns 
            and performance metrics, all handled in accordance with our{" "}
            <Link to="/privacy" className="public-link">Privacy Policy</Link>.
          </p>
          <p>
            Aggregated and anonymized data may be used for research purposes to advance AI-assisted software development 
            and improve outcomes in the public sector.
          </p>

          <h2 className="public-heading">Modifications to Terms</h2>
          <p>
            These terms of service are subject to change by Alberta at our discretion. We will notify users of significant 
            changes through the platform or via email when possible.
          </p>
          <p>
            Continued use of the service after changes have been made constitutes acceptance of the revised terms. It is 
            your responsibility to review these terms periodically for updates.
          </p>

          <h2 className="public-heading">Governing Law and Jurisdiction</h2>
          <p>
            These Terms of Use are governed by and construed in accordance with the laws of the Province of Alberta and 
            the laws of Canada applicable therein. Any disputes arising from these terms or your use of the service shall 
            be subject to the exclusive jurisdiction of the courts of Alberta.
          </p>

          <h2 className="public-heading">Questions About These Terms?</h2>
          <p>
            If you have any questions about these Terms of Use or need clarification on any provisions, please contact us:
          </p>
          <p>
            <strong>Email:</strong>{" "}
            <a href="mailto:ti.pronghorn@gov.ab.ca" className="public-link">ti.pronghorn@gov.ab.ca</a>
          </p>
          <p>
            <strong>Organization:</strong> Government of Alberta, Ministry of Technology and Innovation
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer role="contentinfo" className="py-8 px-6 public-footer">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <Link to="/" className="flex items-center gap-3">
            <PronghornLogo className="h-6 w-6 rounded-lg" />
            <span className="text-sm font-semibold tracking-tight public-heading">Pronghorn</span>
          </Link>
          <nav role="navigation" aria-label="Footer navigation" className="flex items-center gap-6 text-sm public-text-muted">
            <Link to="/terms" className="hover:text-[var(--public-brand)] underline decoration-1 underline-offset-2 transition-colors">Terms of Use</Link>
            <Link to="/privacy" className="hover:text-[var(--public-brand)] underline decoration-1 underline-offset-2 transition-colors">Privacy Policy</Link>
            <Link to="/license" className="hover:text-[var(--public-brand)] underline decoration-1 underline-offset-2 transition-colors">License</Link>
          </nav>
          <p className="text-sm public-text-muted">© 2025 Government of Alberta</p>
        </div>
      </footer>
    </div>
  );
}
