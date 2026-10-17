const forbidden =
  /^(?:debug|tasks|createTerminal|terminals|activeTerminal|onDid.*Terminal|registerTaskProvider|executeTask|fetchTasks|taskExecutions|startDebugging|registerDebug.*|registerTask.*|getBuiltinModule|binding)$/
export const vscodeBoundary = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      blocked:
        'VS Code integration may preview and apply WorkspaceEdit only; execution APIs are forbidden.'
    }
  },
  create(context) {
    const namespaces = new Set()
    const report = (node) => context.report({ node, messageId: 'blocked' })
    const member = (node) => (node.computed ? node.property.value : node.property.name)
    const root = (node) => (node.type === 'MemberExpression' ? root(node.object) : node.name)
    return {
      ImportDeclaration(node) {
        if (/^(?:node:)?child_process(?:\/|$)/.test(node.source.value)) report(node)
        if (node.source.value === 'vscode') {
          for (const spec of node.specifiers) {
            if (spec.type === 'ImportNamespaceSpecifier') namespaces.add(spec.local.name)
            else report(spec)
          }
        }
      },
      ImportExpression(node) {
        report(node)
      },
      CallExpression(node) {
        if (node.callee.name === 'require') report(node)
      },
      MemberExpression(node) {
        const key = member(node)
        if (forbidden.test(key ?? '')) report(node)
        if (node.computed && typeof key !== 'string' && namespaces.has(root(node))) report(node)
        if (key === 'executeCommand') {
          const call = node.parent
          if (
            call.type !== 'CallExpression' ||
            call.callee !== node ||
            call.arguments[0]?.value !== 'vscode.diff'
          )
            report(node)
        }
      },
      Property(node) {
        if (
          node.parent.type === 'ObjectPattern' &&
          (forbidden.test(node.key.name ?? node.key.value ?? '') ||
            (node.key.name ?? node.key.value) === 'executeCommand')
        )
          report(node)
      }
    }
  }
}
