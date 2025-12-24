import { Link } from "react-router-dom";
import { PronghornLogo } from "@/components/layout/PronghornLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

const License = () => {
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
              <Link to="/terms" className="public-text-muted hover:text-[var(--public-brand)] transition-colors underline decoration-1 underline-offset-2">
                Terms
              </Link>
              <Link to="/privacy" className="public-text-muted hover:text-[var(--public-brand)] transition-colors underline decoration-1 underline-offset-2">
                Privacy
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main role="main" id="main-content" className="container mx-auto px-6 pt-32 pb-16 max-w-4xl">
        <h1 className="text-4xl font-medium tracking-tight mb-2 public-heading">MIT License</h1>
        <p className="public-text-muted mb-8">Effective Date: December 10, 2025</p>

        <div className="prose max-w-none space-y-6">
          <div className="public-card rounded-lg p-6 font-mono text-sm leading-relaxed">
            <p className="mb-4 font-semibold public-heading">MIT License</p>
            <p className="mb-4 public-text-muted">Copyright (c) 2025 Government of Alberta</p>
            <p className="mb-4 public-text-muted">
              Permission is hereby granted, free of charge, to any person obtaining a copy
              of this software and associated documentation files (the "Software"), to deal
              in the Software without restriction, including without limitation the rights
              to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
              copies of the Software, and to permit persons to whom the Software is
              furnished to do so, subject to the following conditions:
            </p>
            <p className="mb-4 public-text-muted">
              The above copyright notice and this permission notice shall be included in all
              copies or substantial portions of the Software.
            </p>
            <p className="public-text-muted">
              THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
              FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
              AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
              LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
              OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
              SOFTWARE.
            </p>
          </div>

          <section className="mt-12">
            <h2 className="text-2xl font-semibold mb-4 public-heading">What This Means</h2>
            <p className="public-text-muted leading-relaxed">
              The MIT License is a permissive open-source license that allows you to:
            </p>
            <ul className="list-disc list-inside public-text-muted mt-4 space-y-2">
              <li>Use the software for any purpose, including commercial applications</li>
              <li>Modify the source code to suit your needs</li>
              <li>Distribute copies of the original or modified software</li>
              <li>Include the software in proprietary projects</li>
            </ul>
            <p className="public-text-muted mt-4 leading-relaxed">
              The only requirement is that you include the original copyright notice and license
              text in any copy or substantial portion of the software.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-semibold mb-4 public-heading">Open Source</h2>
            <p className="public-text-muted leading-relaxed">
              Pronghorn is developed by the Government of Alberta as an open-source project.
              We believe in transparency, collaboration, and sharing tools that can benefit
              the broader community.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-semibold mb-4 public-heading">Contact</h2>
            <p className="public-text-muted leading-relaxed">
            For questions about the license or the project, please contact:{" "}
              <a
                href="mailto:ti.pronghorn@gov.ab.ca"
                className="public-link underline decoration-1 underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]"
              >
                ti.pronghorn@gov.ab.ca
              </a>
            </p>
          </section>
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
};

export default License;
