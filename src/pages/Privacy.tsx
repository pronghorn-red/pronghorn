import { Link } from "react-router-dom";
import { PronghornLogo } from "@/components/layout/PronghornLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Privacy() {
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
        <nav role="navigation" aria-label="Main navigation" className="fixed w-full top-0 z-50 public-nav">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <PronghornLogo className="h-8 w-8 rounded-lg" />
              <span className="text-xl font-semibold tracking-tight public-heading">Pronghorn</span>
              <Link to="/terms" className="public-brand underline decoration-1 underline-offset-2 text-sm font-medium hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]">(Alpha)</Link>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link to="/terms" className="public-text-muted hover:text-[var(--public-brand)] transition-colors underline decoration-1 underline-offset-2">
                Terms
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
        <p className="text-sm public-text-muted uppercase tracking-wider mb-2">Your Data Matters</p>
        <h1 className="text-4xl font-medium tracking-tight mb-4 public-heading">Privacy Policy</h1>
        <p className="text-lg public-text-muted mb-8">
          We believe in transparency and protecting your privacy. Learn how we collect, use, and safeguard your information.
        </p>
        <p className="text-sm public-text-muted mb-8">Last updated: December 10, 2025</p>

        <div className="prose max-w-none space-y-6 public-prose">

          <h2 className="public-heading">Our Commitment</h2>
          <p>
            The Government of Alberta, Ministry of Technology and Innovation is committed to ensuring your privacy while 
            you use the Pronghorn platform.
          </p>

          <h2 className="public-heading">Standard Information Collected by Web Server</h2>
          <p>
            When you access this service, our web server automatically collects a limited amount of standard information 
            essential to the operation and evaluation of the service. This includes the page from which you arrived, the 
            date and time of your page request, the IP address your computer is using to receive information, the type 
            and version of your browser, and the name and size of the file you request.
          </p>
          <p>
            This information is not used to identify individuals who use the service, nor is it disclosed to other public 
            bodies or individuals.
          </p>

          <h2 className="public-heading">Collection of Personal Information</h2>
          <p>
            Personal information is collected directly from you when you voluntarily register for an account or interact 
            with the service. For example, when creating an account, you will be asked to provide your name and email address.
          </p>
          <p>
            In accordance with Section 5(2) of the Protection of Privacy Act (POPA), we provide the following notice for 
            the collection of your personal information:
          </p>
          <ul>
            <li>
              <strong>(a) Purpose:</strong> The personal information is collected to process and respond to your requests 
              related to the service, including account creation and management.
            </li>
            <li>
              <strong>(b) Legal Authority:</strong> This collection is authorized under Section 4(c) of POPA, as the 
              information relates directly to and is necessary for an operating program or activity of the Government of Alberta.
            </li>
            <li>
              <strong>(c) Contact Information:</strong> If you have questions about the collection of your personal 
              information, please contact us at{" "}
              <a href="mailto:ti.pronghorn@gov.ab.ca" className="public-link">ti.pronghorn@gov.ab.ca</a>.
            </li>
            <li>
              <strong>(d) Automated System Use:</strong> The personal information, along with any content you create 
              (such as prompts or project data), will be input into an automated system to generate content or provide 
              AI-assisted development capabilities.
            </li>
          </ul>
          <p>
            This personal information is disclosed only to authorized personnel who use it for the specified purposes. 
            While the personal information you send is secure once it reaches the government server, it may not be secure 
            in transit between your computer and ours.
          </p>

          <h2 className="public-heading">Cookies</h2>
          <p>
            When you visit a website it may deposit a piece of data, called a web cookie, with the temporary web browser 
            files on your computer.
          </p>
          <p>
            If you wish, you can change the settings on your web browser to deny cookies, or to warn you when a site is 
            about to deposit cookies on your hard drive.
          </p>
          <p>
            Government of Alberta websites use cookies to collect anonymous statistical information such as browser type, 
            screen size, traffic patterns and pages visited. This information helps us provide you with better service. 
            We do not store personal information in cookies, nor do we collect personal information from you without your 
            knowledge, as you browse the site.
          </p>

          <h3 className="public-heading">Cookies from Third Party Applications</h3>
          <p>
            This site uses a number of third party products. Read their privacy statements to find out how they track 
            and use your information:
          </p>
          <ul>
            <li>
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="public-link">
                Supabase Privacy Policy
              </a>
            </li>
            <li>
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="public-link">
                Google Privacy Policy
              </a>
            </li>
            <li>
              <a href="https://privacy.microsoft.com/" target="_blank" rel="noopener noreferrer" className="public-link">
                Microsoft Privacy Policy
              </a>
            </li>
            <li>
              <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer" className="public-link">
                GitHub Privacy Statement
              </a>
            </li>
            <li>
              <a href="https://render.com/privacy" target="_blank" rel="noopener noreferrer" className="public-link">
                Render.com Privacy Policy
              </a>
            </li>
          </ul>

          <h2 className="public-heading">Security</h2>
          <p>
            The Government of Alberta's computer system uses software to monitor unauthorized attempts to upload or change 
            information, or damage the service we provide. No attempt is made to identify users or their usage patterns 
            except during law enforcement investigations.
          </p>

          <h2 className="public-heading">Data Retention and Deletion</h2>
          <p>
            In accordance with Section 6(b) of the Protection of Privacy Act (POPA), we will retain your personal 
            information for the minimum period necessary to fulfill the purposes outlined in this Privacy Statement, and 
            in compliance with the Government of Alberta's established Records Retention and Disposition Schedule. This 
            schedule ensures that personal information is retained and used only to the extent required to meet our legal 
            obligations under POPA and other applicable Alberta laws, after which it will be securely disposed of.
          </p>
          <p>
            You may request the deletion of your account and associated data by contacting us at{" "}
            <a href="mailto:ti.pronghorn@gov.ab.ca" className="public-link">ti.pronghorn@gov.ab.ca</a>. We will evaluate such requests in alignment with
            POPA requirements and the Records Retention and Disposition Schedule, taking reasonable steps to delete your
            personal information from our records where permissible, except where retention is required for legal purposes 
            under Alberta law.
          </p>

          <h2 className="public-heading">Your Rights</h2>
          <h3 className="public-heading">Correction of Personal Information</h3>
          <p>
            The Protection of Privacy Act provides the right to request correction of your personal information. Please 
            contact us at <a href="mailto:ti.pronghorn@gov.ab.ca" className="public-link">ti.pronghorn@gov.ab.ca</a> and we will redirect your request
            to the office authorized to receive such a request.
          </p>
          <h3 className="public-heading">Access to Information</h3>
          <p>
            The Access to Information Act provides the right of access to information, including your own personal 
            information. The ATI request form is available through the{" "}
            <a href="https://www.alberta.ca/eservices.aspx" target="_blank" rel="noopener noreferrer" className="public-link">
              eServices page
            </a>.
          </p>

          <h2 className="public-heading">Contact Information</h2>
          <p>
            If you have any questions about this Privacy Statement or the collection, use, or disclosure of your personal 
            information, please contact us at:
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
