# Justin Adam C. Umalay - Personal CV Website

## Description

This project is a responsive personal CV and portfolio website for Justin Adam C. Umalay, a Bachelor of Science in Information Technology student at Davao del Norte State College. It presents his education, skills, certificates, projects, experience, and contact details in an accessible single-page layout with light and dark themes.

## Student information

- **Student name:** Justin Adam C. Umalay
- **Project title:** Justin Adam C. Umalay - Personal CV Website
- **Live website:** Not deployed yet

> Update the live website value above after deploying the project to Vercel.

## Technologies used

- HTML5
- CSS3
- Vanilla JavaScript
- Node.js built-in test runner for automated tests
- Google Fonts (Bricolage Grotesque and DM Sans)

## Features

- Responsive layout for desktop, tablet, and mobile screens
- Light and dark theme switching with saved visitor preference
- System color-scheme detection and reduced-motion support
- Mobile navigation menu
- Animated role text and scroll-reveal sections
- Filterable portfolio projects
- Certificate image lightbox
- Contact form that creates an email draft
- Accessible labels, focus states, and semantic HTML

## Project structure

```text
.
├── index.html                 # Website entry point
├── css/
│   └── styles.css             # Layout, responsive styles, and themes
├── js/
│   ├── script.js              # Navigation and page interactions
│   └── theme.js               # Theme selection and persistence
├── assets/
│   ├── icons/                 # Technology and social icons
│   ├── projects/              # Project screenshots
│   └── ...                    # Profile photo and certificates
├── tests/
│   ├── theme.test.cjs         # Node-based theme and source checks
│   └── browser-theme.cjs      # Optional Chrome visual and interaction QA
├── .gitignore
└── README.md
```

## Run locally

This is a static website, so it does not require a build step.

1. Clone or download the repository.
2. Open `index.html` in a browser.

For more reliable local asset loading, serve the folder with any static HTTP server. For example, with Node.js installed:

```bash
npx serve .
```

Then open the local URL printed by the command.

## Test locally

Run the unit-style source and theme tests from the project root:

```bash
node --test tests/theme.test.cjs
```

The optional browser QA script requires Google Chrome:

```bash
node tests/browser-theme.cjs
```

## Deployment

This project can be deployed directly as a static site on Vercel. Import the GitHub repository in the Vercel dashboard, leave the framework preset as **Other**, keep the build command empty, and use `.` as the output directory if Vercel asks for one. Vercel will provide the production URL after deployment.

## Development workflow

The repository history records the project in incremental stages, including accessibility improvements, interaction updates, automated checks, performance work, and documentation. To inspect the development process:

```bash
git log --oneline --decorate --graph
```

Before submitting, confirm that the GitHub repository contains the complete source code, the tests pass, and the README has been updated with the final Vercel URL.
