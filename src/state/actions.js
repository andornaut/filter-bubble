// Error actions
export const addError = (setState, message) => {
  message = message.toString();
  const now = new Date().toJSON();

  setState((prevState) => {
    const errorsList = prevState.errors?.list || [];
    const existingError = errorsList.find((error) => error.message === message);

    if (existingError) {
      // Update existing error
      return {
        ...prevState,
        errors: {
          ...prevState.errors,
          list: errorsList.map((error) => (error.message === message ? { ...error, modifiedDate: now } : error)),
        },
      };
    } else {
      // Add new error
      return {
        ...prevState,
        errors: {
          ...prevState.errors,
          list: [...errorsList, { message, modifiedDate: now }],
        },
      };
    }
  });
};

export const clearAllErrors = (setState) => {
  setState((prevState) => ({
    ...prevState,
    errors: { ...prevState.errors, list: [] },
  }));
};

// Topics actions
export const toTopicId = (topic) => {
  const text = topic?.text;
  return (Array.isArray(text) ? text : []).toString();
};

export const addTopic = (setState, topicData) => {
  const now = new Date().toJSON();
  const data = {
    ...topicData,
    createdDate: now,
    enabled: true,
    modifiedDate: now,
  };

  setState((prevState) => {
    const list = prevState.topics?.list || [];
    const id = toTopicId(data);

    if (list.find((item) => toTopicId(item) === id)) {
      throw new Error(`Duplicate item: ${id}`);
    }

    return {
      ...prevState,
      topics: {
        ...prevState.topics,
        list: [...list, data],
        selected: null,
      },
    };
  });
};

export const editTopic = (setState, topicData, selected) => {
  const now = new Date().toJSON();
  const data = {
    ...selected,
    ...topicData,
    modifiedDate: now,
  };

  setState((prevState) => {
    const list = prevState.topics?.list || [];
    const dataId = toTopicId(data);
    const selectedId = toTopicId(selected);

    if (dataId !== selectedId && list.findIndex((item) => toTopicId(item) === dataId) !== -1) {
      throw new Error(`Duplicate item: ${dataId}`);
    }

    const index = list.findIndex((item) => toTopicId(item) === selectedId);
    if (index === -1) {
      throw new Error(`Item not found: ${selectedId}`);
    }

    const newList = [...list];
    newList[index] = data;

    return {
      ...prevState,
      topics: {
        ...prevState.topics,
        list: newList,
        selected: null,
      },
    };
  });
};

export const deleteTopic = (setState, selected) => {
  setState((prevState) => {
    const list = prevState.topics?.list || [];
    const selectedId = toTopicId(selected);
    const index = list.findIndex((item) => toTopicId(item) === selectedId);

    if (index < 0) {
      throw new Error(`Item not found: ${selectedId}`);
    }

    const newList = [...list];
    newList.splice(index, 1);

    return {
      ...prevState,
      topics: {
        ...prevState.topics,
        list: newList,
        selected: null,
      },
    };
  });
};

export const selectTopic = (setState, id) => {
  setState((prevState) => {
    const list = prevState.topics?.list || [];
    const item = list.find((topic) => toTopicId(topic) === id);

    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    return {
      ...prevState,
      topics: {
        ...prevState.topics,
        selected: item,
      },
    };
  });
};

export const toggleTopicEnabled = (setState, id) => {
  setState((prevState) => {
    const list = prevState.topics?.list || [];
    const index = list.findIndex((item) => toTopicId(item) === id);

    if (index === -1) {
      throw new Error(`Item not found: ${id}`);
    }

    const newList = [...list];
    newList[index] = { ...newList[index], enabled: !newList[index].enabled };

    return {
      ...prevState,
      topics: {
        ...prevState.topics,
        list: newList,
      },
    };
  });
};

export const cancelSelectedTopic = (setState) => {
  setState((prevState) => ({
    ...prevState,
    topics: {
      ...prevState.topics,
      selected: null,
    },
  }));
};

// Website actions
export const toWebsiteId = (website) => {
  const addresses = website?.addresses;
  return (Array.isArray(addresses) ? addresses : []).toString();
};

export const addWebsite = (setState, websiteData) => {
  const now = new Date().toJSON();
  const data = {
    ...websiteData,
    createdDate: now,
    enabled: true,
    modifiedDate: now,
  };

  setState((prevState) => {
    const list = prevState.websites?.list || [];
    const id = toWebsiteId(data);

    if (list.find((item) => toWebsiteId(item) === id)) {
      throw new Error(`Duplicate item: ${id}`);
    }

    return {
      ...prevState,
      websites: {
        ...prevState.websites,
        list: [...list, data],
        selected: null,
      },
    };
  });
};

export const editWebsite = (setState, websiteData, selected) => {
  const now = new Date().toJSON();
  const data = {
    ...selected,
    ...websiteData,
    modifiedDate: now,
  };

  setState((prevState) => {
    const list = prevState.websites?.list || [];
    const dataId = toWebsiteId(data);
    const selectedId = toWebsiteId(selected);

    if (dataId !== selectedId && list.findIndex((item) => toWebsiteId(item) === dataId) !== -1) {
      throw new Error(`Duplicate item: ${dataId}`);
    }

    const index = list.findIndex((item) => toWebsiteId(item) === selectedId);
    if (index === -1) {
      throw new Error(`Item not found: ${selectedId}`);
    }

    const newList = [...list];
    newList[index] = data;

    return {
      ...prevState,
      websites: {
        ...prevState.websites,
        list: newList,
        selected: null,
      },
    };
  });
};

export const deleteWebsite = (setState, selected) => {
  setState((prevState) => {
    const list = prevState.websites?.list || [];
    const selectedId = toWebsiteId(selected);
    const index = list.findIndex((item) => toWebsiteId(item) === selectedId);

    if (index < 0) {
      throw new Error(`Item not found: ${selectedId}`);
    }

    const newList = [...list];
    newList.splice(index, 1);

    return {
      ...prevState,
      websites: {
        ...prevState.websites,
        list: newList,
        selected: null,
      },
    };
  });
};

export const selectWebsite = (setState, id) => {
  setState((prevState) => {
    const list = prevState.websites?.list || [];
    const item = list.find((website) => toWebsiteId(website) === id);

    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    return {
      ...prevState,
      websites: {
        ...prevState.websites,
        selected: item,
      },
    };
  });
};

export const toggleWebsiteEnabled = (setState, id) => {
  setState((prevState) => {
    const list = prevState.websites?.list || [];
    const index = list.findIndex((item) => toWebsiteId(item) === id);

    if (index === -1) {
      throw new Error(`Item not found: ${id}`);
    }

    const newList = [...list];
    newList[index] = { ...newList[index], enabled: !newList[index].enabled };

    return {
      ...prevState,
      websites: {
        ...prevState.websites,
        list: newList,
      },
    };
  });
};

export const cancelSelectedWebsite = (setState) => {
  setState((prevState) => ({
    ...prevState,
    websites: {
      ...prevState.websites,
      selected: null,
    },
  }));
};

// Help actions
export const toggleShowHelp = (setState) => {
  setState((prevState) => ({
    ...prevState,
    showHelp: !prevState.showHelp,
  }));
};

// Permission actions
export const setHasPermissions = (setState, hasPermissions) => {
  setState((prevState) => {
    if (prevState.hasPermissions !== hasPermissions) {
      return {
        ...prevState,
        hasPermissions,
      };
    }
    return prevState;
  });
};
