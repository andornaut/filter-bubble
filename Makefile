.DEFAULT_GOAL := check

NODE_IMAGE := node:$(shell sed 's/^v//' .nvmrc)
MARKDOWN_IMAGE := node:24.22.2
SHELLCHECK_IMAGE := koalaman/shellcheck:v0.11.0

export NODE_IMAGE MARKDOWN_IMAGE SHELLCHECK_IMAGE
export CHECK_TIMEOUT_SECONDS CHECK_MEMORY CHECK_SCRATCH_SIZE CHECK_WORK_SIZE CHECK_TMP_SIZE

.PHONY: check lint test build

check lint test build:
	@./tests/container/check-stock $@
