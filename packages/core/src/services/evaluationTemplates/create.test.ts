import { beforeEach, describe, expect, it, vi } from 'vitest'

import { findEvaluationTemplateCategoryById } from '../../data-access/evaluationTemplateCategories'
import { NotFoundError, Result } from '../../lib'
import * as evaluationTemplateCategoriesService from '../evaluationTemplateCategories/create'
import { createEvaluationTemplate } from './create'

describe('createEvaluationTemplate', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
  })

  it('creates a template with an existing category', async () => {
    const category = await evaluationTemplateCategoriesService
      .createEvaluationTemplateCategory({
        name: 'Existing Category',
      })
      .then((r) => r.unwrap())

    const result = await createEvaluationTemplate({
      name: 'Test Template',
      description: 'Test Description',
      categoryId: category.id,
      prompt: 'Test Prompt',
    })

    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({
      name: 'Test Template',
      description: 'Test Description',
      categoryId: category.id,
      prompt: 'Test Prompt',
    })
  })

  it('creates a template with a new category when categoryId is not found', async () => {
    const result = await createEvaluationTemplate({
      name: 'Test Template',
      description: 'Test Description',
      categoryId: 999,
      categoryName: 'New Category',
      prompt: 'Test Prompt',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        name: 'Test Template',
        description: 'Test Description',
        prompt: 'Test Prompt',
      })

      const category = await findEvaluationTemplateCategoryById(
        result.value!.categoryId!,
      ).then((r) => r.unwrap())

      expect(category.name).toBe('New Category')
    }
  })

  it('creates a template with a new default category when no category is provided', async () => {
    const result = await createEvaluationTemplate({
      name: 'Test Template',
      description: 'Test Description',
      prompt: 'Test Prompt',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        name: 'Test Template',
        description: 'Test Description',
        prompt: 'Test Prompt',
      })

      const category = await findEvaluationTemplateCategoryById(
        result.value!.categoryId!,
      ).then((r) => r.unwrap())
      expect(category.name).toBe('Default Category')
    }
  })

  it('handles errors when category creation fails', async () => {
    vi.spyOn(
      evaluationTemplateCategoriesService,
      'createEvaluationTemplateCategory',
    ).mockResolvedValue(
      Result.error(new NotFoundError('Category creation failed')),
    )

    const result = await createEvaluationTemplate({
      name: 'Test Template',
      description: 'Test Description',
      categoryName: 'New Category',
      prompt: 'Test Prompt',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toBe('Category creation failed')
  })
})
