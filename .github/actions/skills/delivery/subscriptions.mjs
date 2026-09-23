const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const packagePattern = /^@atls\/skill-([a-z0-9]+(?:-[a-z0-9]+)*)$/

export const fromManifests = (manifests) => {
  const slugs = new Set()

  for (const manifest of manifests) {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, range] of Object.entries(manifest[field] || {})) {
        const match = packagePattern.exec(name)
        if (match && range === 'latest') slugs.add(match[1])
      }
    }
  }

  return [...slugs].sort()
}

export const parse = (value) => {
  if (value == null || value === '') return []
  if (typeof value !== 'string') throw new Error('Invalid skill_packages custom property')
  const slugs = value.split(',')
  if (slugs.some((slug) => !slugPattern.test(slug)) || new Set(slugs).size !== slugs.length) {
    throw new Error('Invalid skill_packages custom property')
  }
  return slugs
}

export const format = (slugs) => {
  const value = [...new Set(slugs)].sort().join(',')
  if (value.length > 75) throw new Error('skill_packages exceeds the GitHub custom property limit')
  return value || null
}
