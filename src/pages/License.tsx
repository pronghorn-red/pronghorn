import { Link } from "react-router-dom";
import { PronghornLogo } from "@/components/layout/PronghornLogo";

const License = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3">
            <PronghornLogo className="h-8 w-8" />
            <span className="text-xl font-bold text-foreground">
              Pronghorn{" "}
              <Link to="/terms" className="text-primary hover:underline text-sm font-normal">
                (Alpha)
              </Link>
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-6 pt-32 pb-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-2">MIT License</h1>
        <p className="text-muted-foreground mb-8">Effective Date: December 10, 2025</p>

        <div className="prose max-w-none space-y-6">
          <div className="bg-muted/50 border border-border rounded-lg p-6 font-mono text-sm leading-relaxed text-foreground">
            <p className="mb-4 font-semibold">MIT License</p>
            <p className="mb-4">Copyright (c) 2025 Government of Alberta</p>
            <p className="mb-4">
              Permission is hereby granted, free of charge, to any person obtaining a copy
              of this software and associated documentation files (the "Software"), to deal
              in the Software without restriction, including without limitation the rights
              to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
              copies of the Software, and to permit persons to whom the Software is
              furnished to do so, subject to the following conditions:
            </p>
            <p className="mb-4">
              The above copyright notice and this permission notice shall be included in all
              copies or substantial portions of the Software.
            </p>
            <p>
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
            <h2 className="text-2xl font-semibold mb-4">What This Means</h2>
            <p className="text-muted-foreground leading-relaxed">
              The MIT License is a permissive open-source license that allows you to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Use the software for any purpose, including commercial applications</li>
              <li>Modify the source code to suit your needs</li>
              <li>Distribute copies of the original or modified software</li>
              <li>Include the software in proprietary projects</li>
            </ul>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              The only requirement is that you include the original copyright notice and license
              text in any copy or substantial portion of the software.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-semibold mb-4">Open Source</h2>
            <p className="text-muted-foreground leading-relaxed">
              Pronghorn is developed by the Government of Alberta as an open-source project.
              We believe in transparency, collaboration, and sharing tools that can benefit
              the broader community.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-2xl font-semibold mb-4">Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
            For questions about the license or the project, please contact:{" "}
              <a
                href="mailto:ti.pronghorn@gov.ab.ca"
                className="text-primary hover:underline"
              >
                ti.pronghorn@gov.ab.ca
              </a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <PronghornLogo className="h-8 w-8" />
              <span className="text-lg font-semibold">Pronghorn</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link to="/license" className="hover:text-foreground transition-colors">
                License
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Government of Alberta
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default License;
