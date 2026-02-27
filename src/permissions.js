import { setHasPermissions } from "./actions/permissions";

const toPermissions = (addresses) => ({
  origins: addresses.map((address) => `*://${address}/*`),
});

const getPermissionsFromState = (state) => {
  const addresses = state.websites.list.reduce((accumulator, current) => {
    accumulator.push(...current.addresses);
    return accumulator;
  }, []);

  return toPermissions(addresses);
};

const requestPermissions = (permissions) =>
  chrome.permissions.request(permissions).then(setHasPermissions);

export const checkPermissions = (state) =>
  chrome.permissions
    .contains(getPermissionsFromState(state))
    .then(setHasPermissions);

export const requestPermissionsFromAddresses = (addresses) =>
  requestPermissions(toPermissions(addresses));

export const requestPermissionsFromState = (state) =>
  requestPermissions(getPermissionsFromState(state));
