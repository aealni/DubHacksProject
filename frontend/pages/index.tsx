import Head from 'next/head';
import Link from 'next/link';

export default function IndexPage() {
	return (
		<>
			<Head>
				<title>Mango Workspace</title>
				<meta
					name="description"
					content="Jump straight into the Mango collaborative workspace to clean and explore data."
				/>
			</Head>
			<main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex items-center justify-center px-6 py-16 transition-colors duration-300">
				<div className="max-w-xl text-center space-y-6">
					<div className="space-y-3">
						<p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
							Mango Workspace
						</p>
						<h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
							Bring your data to life in minutes
						</h1>
					</div>
					<p className="text-sm text-slate-600 dark:text-slate-300">
						Upload files, clean messy columns, build quick models, and share canvases without leaving the browser.
					</p>
					<div className="flex flex-col sm:flex-row items-center justify-center gap-4">
						<Link
							href="/workspace"
							className="inline-flex items-center justify-center rounded-full bg-amber-400 px-6 py-3 font-medium text-slate-950 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
						>
							Enter workspace sandbox
						</Link>
						<Link
							href="/workspace?mode=education"
							className="inline-flex items-center justify-center rounded-full border border-amber-400 px-6 py-3 font-medium text-amber-500 transition hover:bg-amber-400 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 dark:text-amber-300"
						>
							Explore guided education mode
						</Link>
					</div>
				</div>
			</main>
		</>
	);
}
