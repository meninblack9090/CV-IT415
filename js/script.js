(() => {
  'use strict';

  function initializeLoader() {
    window.addEventListener('load', () => {
      window.setTimeout(() => {
        document.getElementById('loader').classList.add('done');
      }, 600);
    });
  }

  function initializeRoleAnimation() {
    const roles = [
      'Information Technology Student',
      'Aspiring Software Developer',
      'Web Development Learner',
    ];
    const roleElement = document.getElementById('role');
    let roleIndex = 0;
    let characterIndex = 0;
    let isDeleting = false;

    function typeNextCharacter() {
      const currentRole = roles[roleIndex];
      roleElement.textContent = currentRole.slice(0, characterIndex);

      if (!isDeleting && characterIndex === currentRole.length) {
        isDeleting = true;
        window.setTimeout(typeNextCharacter, 1600);
        return;
      }

      if (isDeleting && characterIndex === 0) {
        isDeleting = false;
        roleIndex = (roleIndex + 1) % roles.length;
      }

      characterIndex += isDeleting ? -1 : 1;
      window.setTimeout(typeNextCharacter, isDeleting ? 35 : 70);
    }

    typeNextCharacter();
  }

  function initializeNavigation() {
    const header = document.getElementById('top');
    const menuButton = document.getElementById('burger');
    const menu = document.getElementById('links');
    const navigationLinks = [...menu.querySelectorAll('a')];
    const sections = navigationLinks.map(link =>
      document.querySelector(link.getAttribute('href')),
    );

    function updateNavigation() {
      header.classList.toggle('solid', window.scrollY > 40);
      const scrollPosition = window.scrollY + 120;

      sections.forEach((section, index) => {
        const isActive = section.offsetTop <= scrollPosition
          && section.offsetTop + section.offsetHeight > scrollPosition;
        navigationLinks[index].classList.toggle('active', isActive);
      });
    }

    menuButton.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });

    menu.addEventListener('click', event => {
      if (event.target.tagName !== 'A') return;
      menu.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open menu');
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !menu.classList.contains('open')) return;
      menu.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open menu');
      menuButton.focus();
    });

    document.addEventListener('click', event => {
      if (!menu.classList.contains('open')
          || menu.contains(event.target)
          || menuButton.contains(event.target)) return;
      menu.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open menu');
    });

    window.addEventListener('scroll', updateNavigation, { passive: true });
  }

  function initializeScrollReveal() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('.reveal').forEach(element => {
      observer.observe(element);
    });
  }

  function initializeProjectFilters() {
    const filterButtons = [...document.querySelectorAll('.filters button')];
    const projects = [...document.querySelectorAll('#projects .project-card')];

    filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        const selectedCategory = button.dataset.f;

        filterButtons.forEach(filterButton => {
          filterButton.classList.toggle('on', filterButton === button);
        });

        projects.forEach(project => {
          const isHidden = selectedCategory !== 'all'
            && project.dataset.t !== selectedCategory;
          project.classList.toggle('hide', isHidden);
        });
      });
    });
  }

  function initializeCertificateLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = lightbox.querySelector('img');

    function closeLightbox() {
      lightbox.classList.remove('open');
      lightbox.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('.certificate-card button').forEach(button => {
      button.addEventListener('click', () => {
        lightboxImage.src = button.dataset.img;
        lightboxImage.alt = button.dataset.alt;
        lightbox.classList.add('open');
        lightbox.setAttribute('aria-hidden', 'false');
      });
    });

    lightbox.addEventListener('click', event => {
      if (event.target === lightbox || event.target.tagName === 'BUTTON') {
        closeLightbox();
      }
    });

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeLightbox();
    });
  }

  function initializeProfilePhoto() {
    const photo = document.getElementById('profile-photo');
    const image = photo.querySelector('img');
    const placeholder = photo.querySelector('svg');

    function showPlaceholder() {
      image.style.display = 'none';
      placeholder.style.display = 'block';
    }

    image.addEventListener('error', showPlaceholder);
    // A cached failure can occur before the deferred script runs.
    if (image.complete && image.naturalWidth === 0) showPlaceholder();
  }

  function initializeContactForm() {
    const toggle = document.getElementById('email-toggle');
    const form = document.getElementById('contact-form');
    const status = document.getElementById('contact-status');
    const draftLink = document.getElementById('contact-draft-link');
    const recipient = toggle.getAttribute('href').slice('mailto:'.length);

    toggle.addEventListener('click', event => {
      event.preventDefault();
      form.hidden = !form.hidden;
      toggle.setAttribute('aria-expanded', String(!form.hidden));
      toggle.textContent = form.hidden ? 'Email me' : 'Close email form';
      status.textContent = '';
      draftLink.hidden = true;
      if (!form.hidden) form.elements.namedItem('name').focus();
    });

    form.addEventListener('input', event => {
      event.target.setCustomValidity('');
      status.textContent = '';
      draftLink.hidden = true;
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      const fields = Object.fromEntries(
        ['name', 'email', 'subject', 'message'].map(name =>
          [name, form.elements.namedItem(name)],
        ),
      );
      Object.values(fields).forEach(field => {
        field.setCustomValidity(field.value.trim() ? '' : 'Please enter a value.');
      });
      if (!form.reportValidity()) return;

      const body = `Name: ${fields.name.value.trim()}\nEmail: ${fields.email.value.trim()}\n\n${fields.message.value.trim()}`;
      draftLink.href = `mailto:${recipient}?subject=${encodeURIComponent(fields.subject.value.trim())}&body=${encodeURIComponent(body)}`;
      draftLink.hidden = false;
      status.textContent = 'Opening your email app with a draft. Review it and send it there. If nothing opens, use the draft link below.';
      draftLink.click();
    });
  }

  initializeLoader();
  initializeRoleAnimation();
  initializeNavigation();
  initializeScrollReveal();
  initializeProjectFilters();
  initializeCertificateLightbox();
  initializeProfilePhoto();
  initializeContactForm();
  document.getElementById('yr').textContent = new Date().getFullYear();
})();
