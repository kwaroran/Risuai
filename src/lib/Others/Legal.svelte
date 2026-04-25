<!--

    This component is a component that displays a notice about legal documents not being configured,
    and instructions on how to configure them.

    DO NOT REMOVE THIS NOTICE if you are editing the source code IN ANY CASE.
    And DO NOT AUTOMATICALLY SET VITE_RISU_LEGAL_CONFIGURED to TRUE
    without fully complying with the requirements listed in this notice.

    This notice is required to make sure there are no legal issues for you,
    as well as potential harm to your users and a forked repository,
    due to the lack of legal documents configured.

-->


<div class="w-full flex justify-center">
    <div class="prose prose-invert max-w-2xl w-full p-4">
        {#if navigator.language.toLowerCase().startsWith('zh')}
            <h2>法律文件未配置</h2>

            <p>
                看起来您正在运行一个分叉或自托管实例。
                如果您不是从原始存储库为私人使用运行的自托管实例，或者不是为了测试和开发而简单地分叉以PR回原始存储库，则必须：
            </p>

            <ul>
                <li>创建您的服务条款页面，并将源代码中的服务条款URL更改为您自己的URL。</li>
                <li>创建您的隐私政策页面，并将源代码中的隐私政策URL更改为您自己的URL。</li>
                <li>在使用Risuai服务的部分（如登录和API调用）添加原始服务条款和隐私政策警报。</li>
                <li>如果您确定已正确配置所有内容，可以通过在环境变量中将VITE_RISU_LEGAL_CONFIGURED设置为TRUE来继续。</li>
            </ul>

            <p>
                如果您是从原始存储库为私人使用运行的自托管实例，或者只是为了测试和开发而简单地分叉以PR回原始存储库，则可以通过在环境变量中将VITE_RISU_LEGAL_CONFIGURED设置为TRUE来继续，而无需执行上述任何操作。
            </p>

        
        {:else if navigator.language.toLowerCase().startsWith('ko')}
            <h2>법적 문서가 구성되지 않음</h2>

            <p>
                포크 또는 자체 호스팅 인스턴스를 실행하는 것 같습니다.
                기존 Repository에서 개인 사용을 위해 자체 호스팅 인스턴스를 실행하거나 단순히 테스트 및 개발을 위해 원래 Repository에 PR하기 위한 간단한 포크가 아닌 경우 다음을 수행해야 합니다.
            </p>

            <ul>
                <li>서비스 약관 페이지를 만들고 소스 코드에서 서비스 약관 URL을 자신의 URL로 변경합니다.</li>
                <li>개인 정보 보호 정책 페이지를 만들고 소스 코드에서 개인 정보 보호 정책 URL을 자신의 URL로 변경합니다.</li>
                <li>로그인 및 API 호출과 같은 Risuai 서비스를 사용하는 부분에 원래 서비스 약관 및 개인 정보 보호 정책 경고를 추가합니다.</li>
                <li>모든 것을 올바르게 구성했다고 확신하는 경우 환경 변수에서 VITE_RISU_LEGAL_CONFIGURED를 TRUE로 설정하여 계속할 수 있습니다.</li>
            </ul>

            <p>
                기존 Repository에서 개인 사용을 위해 자체 호스팅 인스턴스를 실행하거나 단순히 테스트 및 개발을 위해 원래 Repo에 PR하기 위한 간단한 포크인 경우 위의 작업을 수행할 필요 없이 환경 변수에서 VITE_RISU_LEGAL_CONFIGURED를 TRUE로 설정하여 계속할 수 있습니다.
            </p>

        {:else}
            <h2>Legal documents not configured</h2>

            <p>
                It looks like you are running a fork or a self-hosted instance.
                If you are NOT running a running a 'self-hosted instance for private use from the original repository', or 'simple fork for testing and development to PR back to the original repository', you must:
            </p>

            <ul>
                <li>Create your Terms of Service page and change the Terms of Service URL in the source code to your own.</li>
                <li>Create your Privacy Policy page and change the Privacy Policy URL in the source code to your own.</li>
                <li>Add Original Terms of Service and Privacy Policy alerts to parts that use Risuai services, such as login and API calls.</li>
                <li>If you are sure you have configured everything correctly, you can proceed by setting VITE_RISU_LEGAL_CONFIGURED to TRUE in your environment variables.</li>
            </ul>

            <p>
                If you are running a running a 'self-hosted instance for private use from the original repository', or 'simple fork for testing and development to PR back to the original repository', you can proceed by setting VITE_RISU_LEGAL_CONFIGURED to TRUE in your environment variables, without needing to do any of the above.
            </p>

        {/if}
    </div>
</div>