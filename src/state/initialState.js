import defaultWebsites from '../actions/websites.json';

export const getDefaultState = () => ({
  hasPermissions: false,
  showHelp: false,
  errors: {
    list: [],
  },
  topics: {
    list: [],
    selected: null,
  },
  websites: {
    list: defaultWebsites || [],
    selected: null,
  },
});
