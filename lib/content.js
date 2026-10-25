// Content repository: reads/writes the three editable documents, falling back to defaults.
const defaults = require('./defaults');

function makeContent(store) {
  return {
    async settings() { return { ...defaults.settings, ...((await store.get('settings')) || {}) }; },
    async faqs() { return (await store.get('faqs')) || defaults.faqs; },
    async announcements() { return (await store.get('announcements')) || defaults.announcements; },
    async teams() { return (await store.get('teams')) || defaults.teams; },
    async all() {
      const [settings, faqs, announcements, teams] = await Promise.all([this.settings(), this.faqs(), this.announcements(), this.teams()]);
      return { settings, faqs, announcements, teams };
    },
    saveSettings: (v) => store.set('settings', v),
    saveFaqs: (v) => store.set('faqs', v),
    saveTeams: (v) => store.set('teams', v),
    saveAnnouncements: (v) => store.set('announcements', v),
    defaults,
  };
}
module.exports = { makeContent };
