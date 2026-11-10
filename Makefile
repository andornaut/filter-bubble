.DEFAULT_GOAL := check

CHECK_TASKS := lint test build
BUILD_OUTPUTS := dist web-ext-artifacts
TEST_OUTPUTS :=
CONTAINER_BUILD_ARGS := NODE_VERSION=$(shell sed 's/^v//' .nvmrc)

export CHECK_TASKS BUILD_OUTPUTS TEST_OUTPUTS CONTAINER_BUILD_ARGS
export CHECK_TIMEOUT_SECONDS CHECK_SCRATCH_SIZE CHECK_WORK_SIZE CHECK_TMP_SIZE CONTAINER_IMAGE CHECK_MEMORY
export CHECK_ADMISSION

.PHONY: check lint test build

check lint test build:
	@./tests/container/run $@
