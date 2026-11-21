using System;
using System.IO;
using System.Reflection;

// The installed UE 5.8 tools resolve settings through Windows known folders.
// Redirect only their process-local settings before either tool enters Main.
public static class StartupHook
{
    private const BindingFlags PrivateStatic = BindingFlags.NonPublic | BindingFlags.Static;

    public static void Initialize()
    {
        Assembly entry = Assembly.GetEntryAssembly();
        string tool = entry?.GetName().Name;
        if (tool != "UnrealBuildTool" && tool != "AutomationTool")
            return;

        string root = Environment.GetEnvironmentVariable("TERRA_UNREAL_USER_SETTINGS");
        if (string.IsNullOrEmpty(root) || !Path.IsPathFullyQualified(root) || !Directory.Exists(root) ||
            !string.Equals(Path.GetPathRoot(root), Path.GetPathRoot(AppContext.BaseDirectory), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Unreal's build settings directory must exist on the engine drive.");

        Assembly build = Assembly.LoadFrom(Path.Combine(AppContext.BaseDirectory, "EpicGames.Build.dll"));
        Type unreal = build.GetType("UnrealBuildBase.Unreal", throwOnError: true);
        FieldInfo settings = unreal.GetField("s_userSettingDirectory", PrivateStatic)
            ?? throw new NotSupportedException("This Unreal version does not expose the expected build settings cache.");
        object cache = settings.GetValue(null);
        typeof(StartupHook).GetMethod(nameof(RedirectSettings), PrivateStatic)
            .MakeGenericMethod(settings.FieldType.GenericTypeArguments)
            .Invoke(null, new[] { cache, root });

        if (tool == "UnrealBuildTool")
        {
            // UBT independently looks for global XML settings and can create a
            // default in Windows Roaming AppData. Its project XML still loads.
            Type xml = entry.GetType("UnrealBuildTool.XmlConfig", throwOnError: true);
            FieldInfo globalFiles = xml.GetField("s_cachedInputFiles", PrivateStatic)
                ?? throw new NotSupportedException("This Unreal version does not expose the expected global XML cache.");
            globalFiles.SetValue(null, Array.CreateInstance(globalFiles.FieldType.GetElementType(), 0));
        }

        Console.WriteLine($"{tool} build settings: {root}");
    }

    private static void RedirectSettings<T>(Lazy<T> settings, string root)
    {
        FieldInfo factory = typeof(Lazy<T>).GetField("_factory", BindingFlags.NonPublic | BindingFlags.Instance);
        if (settings.IsValueCreated || factory?.FieldType != typeof(Func<T>))
            throw new NotSupportedException("Cannot redirect Unreal's build settings before initialization.");

        T redirected = (T)Activator.CreateInstance(typeof(T), root);
        factory.SetValue(settings, new Func<T>(() => redirected));
        if (!object.ReferenceEquals(settings.Value, redirected))
            throw new InvalidOperationException("Unreal's build settings redirection did not take effect.");
    }
}
