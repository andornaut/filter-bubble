.DEFAULT_GOAL := check

CHECK_TASKS := lint test build
BUILD_OUTPUTS := dist web-ext-artifacts
TEST_OUTPUTS :=
CONTAINER_BUILD_ARGS := NODE_VERSION=$(shell sed 's/^v//' .nvmrc)

override COMMAND := $(value COMMAND)
override TEST_ARGS := $(value TEST_ARGS)

export CHECK_TASKS BUILD_OUTPUTS TEST_OUTPUTS CONTAINER_BUILD_ARGS TEST_ARGS COMMAND
export CHECK_TIMEOUT_SECONDS CHECK_SCRATCH_SIZE CHECK_WORK_SIZE CHECK_TMP_SIZE CHECK_NETWORK_LINT CONTAINER_IMAGE CHECK_MEMORY

export CHECK_ADMISSION

.PHONY: check check-info lint test build exec staged

check lint test build exec:
	@./tests/container/run $@

check-info:
	@./tests/container/run info

staged:
	@./tests/container/staged orchestrate

